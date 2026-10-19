// Adattatore Google Gemini — SOLO per sviluppo/test (es. piano gratuito).
// In produzione si usa Claude: il piano gratuito Gemini consente a Google di usare
// i testi inviati per migliorare i propri prodotti, quindi niente utenti reali qui.

import type { CaptionModel, ModelResult } from "./ai.ts";
import { AiCallError } from "./ai.ts";
import { requireEnv } from "./env.ts";
import { log } from "./http.ts";
import type { TokenUsage } from "./pricing.ts";
import { setModelPrice } from "./pricing.ts";
import { OUTPUT_SCHEMA, SYSTEM_PROMPT } from "./prompts/index.ts";

export interface GeminiConfig {
  apiKey: string;
  model: string;
  thinkingLevel: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
  maxTokens: number;
  timeoutMs: number;
  /** USD per milione di token; 0 sul piano gratuito. */
  priceInput: number;
  priceOutput: number;
}

export function loadGeminiConfig(): GeminiConfig {
  const level = (Deno.env.get("GEMINI_THINKING_LEVEL") ?? "LOW").toUpperCase();
  return {
    apiKey: requireEnv("GEMINI_API_KEY"),
    model: Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash",
    thinkingLevel: level === "MINIMAL" || level === "MEDIUM" || level === "HIGH" ? level : "LOW",
    maxTokens: Number(Deno.env.get("GEMINI_MAX_TOKENS") ?? 4096),
    timeoutMs: Number(Deno.env.get("GEMINI_TIMEOUT_MS") ?? 15_000),
    priceInput: Number(Deno.env.get("GEMINI_PRICE_INPUT_PER_MTOK") ?? 0),
    priceOutput: Number(Deno.env.get("GEMINI_PRICE_OUTPUT_PER_MTOK") ?? 0),
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  modelVersion?: string;
}

const REFUSAL_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"]);

export function toTokenUsage(meta: GeminiResponse["usageMetadata"]): TokenUsage {
  const cached = meta?.cachedContentTokenCount ?? 0;
  return {
    inputTokens: Math.max((meta?.promptTokenCount ?? 0) - cached, 0),
    // I token di "pensiero" sono fatturati come output.
    outputTokens: (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0),
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
  };
}

export function createGeminiModel(config: GeminiConfig, fetchImpl: typeof fetch = fetch): CaptionModel {
  setModelPrice(config.model, {
    input: config.priceInput,
    output: config.priceOutput,
    cacheRead: config.priceInput / 4,
    cacheWrite: config.priceInput,
  });
  log("warn", "ai_provider_gemini", { model: config.model, note: "solo per sviluppo/test" });

  return {
    model: config.model,
    async complete(userMessage: string): Promise<ModelResult> {
      const started = performance.now();
      let res: Response;
      try {
        res = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
            signal: AbortSignal.timeout(config.timeoutMs),
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
              contents: [{ role: "user", parts: [{ text: userMessage }] }],
              generationConfig: {
                responseMimeType: "application/json",
                responseJsonSchema: OUTPUT_SCHEMA,
                maxOutputTokens: config.maxTokens,
                thinkingConfig: { thinkingLevel: config.thinkingLevel },
              },
            }),
          },
        );
      } catch (err) {
        log("warn", "ai_connection_error", { provider: "gemini", error: String(err) });
        throw new AiCallError("ai_unavailable");
      }

      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        if (res.status === 429 || res.status >= 500) {
          log("warn", "ai_api_error", { provider: "gemini", status: res.status, detail });
          throw new AiCallError("ai_unavailable");
        }
        log("error", "ai_bad_request", { provider: "gemini", status: res.status, detail });
        throw new AiCallError("internal");
      }

      const body = (await res.json()) as GeminiResponse;
      const latencyMs = Math.round(performance.now() - started);
      const usage = toTokenUsage(body.usageMetadata);
      const modelServed = body.modelVersion ?? config.model;
      const candidate = body.candidates?.[0];

      if (body.promptFeedback?.blockReason || REFUSAL_REASONS.has(candidate?.finishReason ?? "")) {
        log("warn", "ai_refusal", {
          provider: "gemini",
          reason: body.promptFeedback?.blockReason ?? candidate?.finishReason ?? null,
        });
        throw new AiCallError("content_refused", usage, modelServed);
      }
      if (!candidate || candidate.finishReason !== "STOP") {
        log("warn", "ai_unexpected_finish", { provider: "gemini", finishReason: candidate?.finishReason ?? null });
        throw new AiCallError("ai_bad_output", usage, modelServed);
      }

      const text = (candidate.content?.parts ?? [])
        .flatMap((p) => (p.thought || typeof p.text !== "string" ? [] : [p.text]))
        .join("");
      try {
        return { output: JSON.parse(text), modelServed, usage, latencyMs };
      } catch {
        log("warn", "ai_invalid_json", { provider: "gemini", length: text.length });
        throw new AiCallError("ai_bad_output", usage, modelServed);
      }
    },
  };
}
