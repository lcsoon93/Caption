// Prezzi in USD per milione di token (listino Anthropic, ottobre 2026).
// Poiché 1 $ = 1e6 micro-USD, costo_micros = token × prezzo_per_MTok.

export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number; // scrittura cache TTL 5 minuti = 1,25 × input
}

const PRICES: Record<string, ModelPrice> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

/** Registra il prezzo di un modello configurato a runtime (es. Gemini via env). */
export function setModelPrice(model: string, price: ModelPrice): void {
  PRICES[model] = price;
}

// Per modelli sconosciuti (es. un fallback nuovo) si stima per eccesso.
const CONSERVATIVE: ModelPrice = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function costMicros(model: string, usage: TokenUsage): number {
  // `modelVersion` di Gemini può avere un suffisso: si cerca anche per prefisso.
  const p = PRICES[model] ?? Object.entries(PRICES).find(([id]) => model.startsWith(id))?.[1] ?? CONSERVATIVE;
  return Math.ceil(
    usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheWriteTokens * p.cacheWrite,
  );
}

export const EMPTY_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
