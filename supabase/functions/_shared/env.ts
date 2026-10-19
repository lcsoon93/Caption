// Configurazione da variabili d'ambiente (lette in modo lazy, così i test non le richiedono).

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

export type Effort = "low" | "medium" | "high";
export type ThinkingMode = "adaptive" | "between_tools";

export interface AiConfig {
  apiKey: string;
  model: string;
  effort: Effort;
  thinking: ThinkingMode;
  maxTokens: number;
  timeoutMs: number;
  serverSideFallback: boolean;
}

function parseEffort(value: string | undefined): Effort {
  return value === "medium" || value === "high" ? value : "low";
}

export function loadAiConfig(): AiConfig {
  return {
    apiKey: requireEnv("ANTHROPIC_API_KEY"),
    // Claude Sonnet 5.5: miglior rapporto qualità/prezzo/latenza per testi brevi.
    model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5",
    // `low`: il modello salta quasi sempre il ragionamento su richieste semplici => latenza bassa.
    effort: parseEffort(Deno.env.get("ANTHROPIC_EFFORT")),
    thinking: Deno.env.get("ANTHROPIC_THINKING") === "between_tools" ? "between_tools" : "adaptive",
    maxTokens: Number(Deno.env.get("ANTHROPIC_MAX_TOKENS") ?? 2048),
    timeoutMs: Number(Deno.env.get("ANTHROPIC_TIMEOUT_MS") ?? 15_000),
    serverSideFallback: Deno.env.get("ANTHROPIC_SERVER_FALLBACK") !== "false",
  };
}
