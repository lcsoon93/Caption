// Adattatore Groq (API compatibile OpenAI) — per la BETA CHIUSA.
// Modelli open source molto veloci; la qualità in italiano è inferiore a Claude,
// che resta il provider della versione pubblica. Groq dichiara di non usare
// i dati inviati via API per addestrare i modelli.

import type { CaptionModel, ModelResult } from "./ai.ts";
import { AiCallError } from "./ai.ts";
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
  maxTokens: number;
  timeoutMs: number;
  /** USD per milione di token (listino); sul piano gratuito non si paga comunque. */
  priceInput: number;
  priceOutput: number;
}

export function loadGroqConfig(): GroqConfig {
  const effort = (Deno.env.get("GROQ_REASONING_EFFORT") ?? "low").toLowerCase();
  return {
    apiKey: requireEnv("GROQ_API_KEY"),
    // Supporta lo schema JSON "strict" (output sempre valido).
    model: Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b",
    reasoningEffort: effort === "medium" || effort === "high" ? effort : "low",
    maxTokens: Number(Deno.env.get("GROQ_MAX_TOKENS") ?? 4096),
    timeoutMs: Number(Deno.env.get("GROQ_TIMEOUT_MS") ?? 20_000),
    priceInput: Number(Deno.env.get("GROQ_PRICE_INPUT_PER_MTOK") ?? 0.15),
    priceOutput: Number(Deno.env.get("GROQ_PRICE_OUTPUT_PER_MTOK") ?? 0.6),
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
  log("warn", "ai_provider_groq", { model: config.model, note: "beta chiusa" });
  const isGptOss = config.model.startsWith("openai/gpt-oss");

  return {
    model: config.model,
    async complete(userMessage: string): Promise<ModelResult> {
      const started = performance.now();
      let res: Response;
      try {
        res = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
          signal: AbortSignal.timeout(config.timeoutMs),
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userMessage },
            ],
            response_format: {
              type: "json_schema",
              json_schema: { name: "captions", strict: true, schema: OUTPUT_SCHEMA },
            },
            max_completion_tokens: config.maxTokens,
            ...(isGptOss ? { reasoning_effort: config.reasoningEffort, include_reasoning: false } : {}),
          }),
        });
      } catch (err) {
        log("warn", "ai_connection_error", { provider: "groq", error: String(err) });
        throw new AiCallError("ai_unavailable");
      }

      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        if (res.status === 429 || res.status >= 500) {
          log("warn", "ai_api_error", { provider: "groq", status: res.status, detail });
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

      const body = (await res.json()) as GroqResponse;
      const latencyMs = Math.round(performance.now() - started);
      const usage = toTokenUsage(body.usage);
      const modelServed = body.model ?? config.model;
      const choice = body.choices?.[0];

      if (choice?.message?.refusal || choice?.finish_reason === "content_filter") {
        log("warn", "ai_refusal", { provider: "groq", reason: choice.finish_reason ?? "refusal" });
        throw new AiCallError("content_refused", usage, modelServed);
      }
      if (!choice || choice.finish_reason !== "stop" || typeof choice.message?.content !== "string") {
        log("warn", "ai_unexpected_finish", { provider: "groq", finishReason: choice?.finish_reason ?? null });
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
