// Adattatore verso l'API Anthropic. La chiave vive solo qui (lato server).

import { Anthropic } from "./deps.ts";
import type { ImageInput } from "./domain/index.ts";
import type { AiConfig } from "./env.ts";
import { AppError, log } from "./http.ts";
import type { TokenUsage } from "./pricing.ts";
import { EMPTY_USAGE } from "./pricing.ts";
import { OUTPUT_SCHEMA, SYSTEM_PROMPT } from "./prompts/index.ts";

export interface ModelResult {
  /** JSON già parsato (da validare con sanitizeCaptions). */
  output: unknown;
  modelServed: string;
  usage: TokenUsage;
  latencyMs: number;
}

/** Errore AI che porta con sé i token già consumati (per contabilizzare il costo). */
export class AiCallError extends AppError {
  constructor(
    code: "ai_unavailable" | "ai_bad_output" | "content_refused" | "internal",
    readonly usage: TokenUsage = EMPTY_USAGE,
    readonly modelServed?: string,
  ) {
    super(code);
  }
}

export interface CaptionModel {
  readonly model: string;
  /** `image`: foto del post (facoltativa), inviata solo al modello e mai salvata. */
  complete(userMessage: string, image?: ImageInput): Promise<ModelResult>;
}

export function createAnthropicModel(config: AiConfig): CaptionModel {
  const client = new Anthropic({ apiKey: config.apiKey, timeout: config.timeoutMs, maxRetries: 1 });

  return {
    model: config.model,
    async complete(userMessage: string, image?: ImageInput): Promise<ModelResult> {
      const started = performance.now();
      let response;
      try {
        response = await client.beta.messages.create({
          model: config.model,
          max_tokens: config.maxTokens,
          // System prompt statico + breakpoint di cache: le richieste successive leggono dalla cache.
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          messages: [{
            role: "user",
            content: image
              ? [
                // Immagine prima del testo: è il riferimento per tutta la richiesta.
                { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
                { type: "text", text: userMessage },
              ]
              : userMessage,
          }],
          output_config: {
            effort: config.effort,
            format: { type: "json_schema", schema: OUTPUT_SCHEMA },
          },
          ...(config.thinking === "between_tools" ? { thinking: { type: "between_tools" as const } } : {}),
          // In caso di rifiuto dei classificatori, il server riprova su un modello consigliato.
          ...(config.serverSideFallback
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {}),
        });
      } catch (err) {
        throw mapAnthropicError(err);
      }

      const latencyMs = Math.round(performance.now() - started);
      const usage: TokenUsage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      };

      if (response.stop_reason === "refusal") {
        log("warn", "ai_refusal", { category: response.stop_details?.category ?? null, model: response.model });
        throw new AiCallError("content_refused", usage, response.model);
      }
      if (response.stop_reason === "max_tokens") {
        log("warn", "ai_max_tokens", { model: response.model, outputTokens: usage.outputTokens });
        throw new AiCallError("ai_bad_output", usage, response.model);
      }

      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("");
      let output: unknown;
      try {
        output = JSON.parse(text);
      } catch {
        log("warn", "ai_invalid_json", { model: response.model, length: text.length });
        throw new AiCallError("ai_bad_output", usage, response.model);
      }

      return { output, modelServed: response.model, usage, latencyMs };
    },
  };
}

function mapAnthropicError(err: unknown): AiCallError {
  if (err instanceof Anthropic.RateLimitError) {
    log("warn", "ai_rate_limited");
    return new AiCallError("ai_unavailable");
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIConnectionError) {
    log("warn", "ai_connection_error", { error: String(err) });
    return new AiCallError("ai_unavailable");
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    log("error", "ai_auth_error");
    return new AiCallError("internal");
  }
  if (err instanceof Anthropic.BadRequestError) {
    log("error", "ai_bad_request", { error: err.message });
    return new AiCallError("internal");
  }
  if (err instanceof Anthropic.APIError) {
    // 5xx / 529 overloaded
    log("warn", "ai_api_error", { status: err.status ?? null });
    return new AiCallError("ai_unavailable");
  }
  log("error", "ai_unknown_error", { error: String(err) });
  return new AiCallError("internal");
}
