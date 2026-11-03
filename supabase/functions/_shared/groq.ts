// Adattatore Groq (API compatibile OpenAI) — per la BETA CHIUSA.
// Modelli open source molto veloci; la qualità in italiano è inferiore a Claude,
// che resta il provider della versione pubblica. Groq dichiara di non usare
// i dati inviati via API per addestrare i modelli.

import type { CaptionModel, ModelResult } from "./ai.ts";
import { AiCallError } from "./ai.ts";
import type { ImageInput } from "./domain/index.ts";
import { requireEnv } from "./env.ts";
import { log } from "./http.ts";
import type { TokenUsage } from "./pricing.ts";
import { setModelPrice } from "./pricing.ts";
import { OUTPUT_SCHEMA, SYSTEM_PROMPT } from "./prompts/index.ts";

export interface GroqConfig {
  apiKey: string;
  model: string;
  /** Solo per i modelli gpt-oss: low | medium | high. */
  reasoningEffort: "low" | "medium" | "high";
  /**
   * Tetto della risposta. Groq lo conta nel limite di token al minuto (8K sul piano base):
   * va tenuto vicino al consumo reale, non al massimo teorico.
   */
  maxTokens: number;
  /** Tetto per le richieste con foto (qwen senza ragionamento: 6 caption ≈ 400-700 token). */
  visionMaxTokens: number;
  timeoutMs: number;
  /** USD per milione di token (listino); sul piano gratuito non si paga comunque. */
  priceInput: number;
  priceOutput: number;
  /** Modello usato quando c'è una foto (il modello testuale non vede le immagini). */
  visionModel: string;
  visionPriceInput: number;
  visionPriceOutput: number;
}

export function loadGroqConfig(): GroqConfig {
  const effort = (Deno.env.get("GROQ_REASONING_EFFORT") ?? "low").toLowerCase();
  return {
    apiKey: requireEnv("GROQ_API_KEY"),
    // Supporta lo schema JSON "strict" (output sempre valido).
    model: Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b",
    reasoningEffort: effort === "medium" || effort === "high" ? effort : "low",
    maxTokens: Number(Deno.env.get("GROQ_MAX_TOKENS") ?? 2048),
    visionMaxTokens: Number(Deno.env.get("GROQ_VISION_MAX_TOKENS") ?? 1024),
    timeoutMs: Number(Deno.env.get("GROQ_TIMEOUT_MS") ?? 20_000),
    priceInput: Number(Deno.env.get("GROQ_PRICE_INPUT_PER_MTOK") ?? 0.15),
    priceOutput: Number(Deno.env.get("GROQ_PRICE_OUTPUT_PER_MTOK") ?? 0.6),
    visionModel: Deno.env.get("GROQ_VISION_MODEL") ?? "qwen/qwen3.8-27b",
    visionPriceInput: Number(Deno.env.get("GROQ_VISION_PRICE_INPUT_PER_MTOK") ?? 0.8),
    visionPriceOutput: Number(Deno.env.get("GROQ_VISION_PRICE_OUTPUT_PER_MTOK") ?? 4),
  };
}

interface GroqResponse {
  model?: string;
  choices?: Array<{
    message?: { content?: string | null; refusal?: string | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
  };
}

/** Attesa massima accettata per un nuovo tentativo dopo un 429 (secondi). */
const MAX_RETRY_WAIT_S = 4;

export function toTokenUsage(usage: GroqResponse["usage"]): TokenUsage {
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    inputTokens: Math.max((usage?.prompt_tokens ?? 0) - cached, 0),
    // completion_tokens include già il ragionamento.
    outputTokens: usage?.completion_tokens ?? 0,
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
  };
}

export function createGroqModel(config: GroqConfig, fetchImpl: typeof fetch = fetch): CaptionModel {
  setModelPrice(config.model, {
    input: config.priceInput,
    output: config.priceOutput,
    cacheRead: config.priceInput / 2,
    cacheWrite: config.priceInput,
  });
  setModelPrice(config.visionModel, {
    input: config.visionPriceInput,
    output: config.visionPriceOutput,
    cacheRead: config.visionPriceInput / 2,
    cacheWrite: config.visionPriceInput,
  });
  log("warn", "ai_provider_groq", { model: config.model, visionModel: config.visionModel, note: "beta" });

  // gpt-oss: ragionamento regolabile; qwen: "none" = risposta diretta (latenza minima).
  function reasoningParams(model: string): Record<string, unknown> {
    if (model.startsWith("openai/gpt-oss")) {
      return { reasoning_effort: config.reasoningEffort, include_reasoning: false };
    }
    if (model.startsWith("qwen/")) return { reasoning_effort: "none" };
    return {};
  }

  return {
    model: config.model,
    async complete(userMessage: string, image?: ImageInput): Promise<ModelResult> {
      const started = performance.now();
      const model = image ? config.visionModel : config.model;
      const deadline = Date.now() + config.timeoutMs;
      const body = JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: image
              ? [
                { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.data}` } },
                { type: "text", text: userMessage },
              ]
              : userMessage,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "captions", strict: true, schema: OUTPUT_SCHEMA },
        },
        max_completion_tokens: image ? config.visionMaxTokens : config.maxTokens,
        ...reasoningParams(model),
      });

      let res: Response | undefined;
      for (let attempt = 0;; attempt++) {
        try {
          res = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
            signal: AbortSignal.timeout(Math.max(deadline - Date.now(), 1)),
            body,
          });
        } catch (err) {
          log("warn", "ai_connection_error", { provider: "groq", model, error: String(err) });
          throw new AiCallError("ai_unavailable");
        }
        // Limite al minuto: se Groq chiede di aspettare poco (e c'è tempo), un solo nuovo tentativo.
        const retryAfter = Number(res.headers.get("retry-after"));
        if (
          res.status === 429 && attempt === 0 && retryAfter > 0 && retryAfter <= MAX_RETRY_WAIT_S &&
          deadline - Date.now() > retryAfter * 1000 + 3000
        ) {
          log("warn", "ai_rate_limited_retry", { provider: "groq", model, status: 429, retryAfter });
          await res.body?.cancel();
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        }
        break;
      }

      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        if (res.status === 429 || res.status >= 500) {
          log("warn", "ai_api_error", {
            provider: "groq",
            model,
            status: res.status,
            retryAfter: res.headers.get("retry-after"),
            detail,
          });
          throw new AiCallError("ai_unavailable");
        }
        // Output non conforme allo schema: si tratta come risposta non valida (rimborso + riprova).
        if (detail.includes("json_validate_failed")) {
          log("warn", "ai_invalid_json", { provider: "groq", status: res.status });
          throw new AiCallError("ai_bad_output");
        }
        log("error", "ai_bad_request", { provider: "groq", status: res.status, detail });
        throw new AiCallError("internal");
      }

      const reply = (await res.json()) as GroqResponse;
      const latencyMs = Math.round(performance.now() - started);
      const usage = toTokenUsage(reply.usage);
      const modelServed = reply.model ?? model;
      const choice = reply.choices?.[0];

      if (choice?.message?.refusal || choice?.finish_reason === "content_filter") {
        log("warn", "ai_refusal", { provider: "groq", reason: choice.finish_reason ?? "refusal" });
        throw new AiCallError("content_refused", usage, modelServed);
      }
      if (!choice || choice.finish_reason !== "stop" || typeof choice.message?.content !== "string") {
        log("warn", "ai_unexpected_finish", {
          provider: "groq",
          model: modelServed,
          finishReason: choice?.finish_reason ?? null,
        });
        throw new AiCallError("ai_bad_output", usage, modelServed);
      }
      try {
        return { output: JSON.parse(choice.message.content), modelServed, usage, latencyMs };
      } catch {
        log("warn", "ai_invalid_json", { provider: "groq", length: choice.message.content.length });
        throw new AiCallError("ai_bad_output", usage, modelServed);
      }
    },
  };
}
