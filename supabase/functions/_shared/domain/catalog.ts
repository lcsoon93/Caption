// Catalogo condiviso tra app mobile ed Edge Functions.
// File puro (nessuna dipendenza): deve girare sia in Deno sia in Metro/React Native.

export const POST_TYPES = [
  "selfie",
  "viaggio",
  "cibo",
  "allenamento",
  "estetica",
  "triste",
  "ironico",
  "motivazionale",
  "altro",
] as const;
export type PostType = (typeof POST_TYPES)[number];

export const TONES = [
  "poetico",
  "ironico",
  "diretto",
  "soft",
  "main_character",
  "minimal",
  "sarcastico",
] as const;
export type Tone = (typeof TONES)[number];

/**
 * Azioni applicabili a una singola caption già generata.
 * `regenerate` produce un'alternativa alla stessa caption (stesso tipo/tono).
 */
export const REFINE_ACTIONS = [
  "more_poetic",
  "shorter",
  "more_ironic",
  "regenerate",
  "longer",
  "translate_en",
] as const;
export type RefineAction = (typeof REFINE_ACTIONS)[number];

export interface CatalogItem {
  label: string;
  emoji: string;
}

export const POST_TYPE_META: Record<PostType, CatalogItem> = {
  selfie: { label: "Selfie", emoji: "🤳" },
  viaggio: { label: "Viaggio", emoji: "✈️" },
  cibo: { label: "Cibo", emoji: "🍝" },
  allenamento: { label: "Allenamento", emoji: "🏋️" },
  estetica: { label: "Estetica", emoji: "🌿" },
  triste: { label: "Triste", emoji: "🌧️" },
  ironico: { label: "Ironico", emoji: "😏" },
  motivazionale: { label: "Motivazionale", emoji: "🔥" },
  altro: { label: "Altro", emoji: "✨" },
};

export const TONE_META: Record<Tone, CatalogItem & { description: string }> = {
  poetico: { label: "Poetico", emoji: "🌙", description: "Immagini evocative, ritmo lento" },
  ironico: { label: "Ironico", emoji: "😏", description: "Leggero, autoironico, intelligente" },
  diretto: { label: "Diretto", emoji: "🎯", description: "Chiaro, sicuro, senza giri di parole" },
  soft: { label: "Soft", emoji: "☁️", description: "Delicato, caldo, gentile" },
  main_character: {
    label: "Main Character",
    emoji: "👑",
    description: "Sicurezza da protagonista, un po' teatrale",
  },
  minimal: { label: "Minimal", emoji: "▫️", description: "Pochissime parole, massimo effetto" },
  sarcastico: { label: "Sarcastico", emoji: "🙃", description: "Pungente, asciutto, mai offensivo" },
};

export const REFINE_ACTION_META: Record<RefineAction, { label: string }> = {
  more_poetic: { label: "Più poetica" },
  shorter: { label: "Più corta" },
  more_ironic: { label: "Più ironica" },
  regenerate: { label: "Rigenera" },
  longer: { label: "Più lunga" },
  translate_en: { label: "In inglese" },
};

export const CONTEXT_MAX_LENGTH = 400;

export function isPostType(value: unknown): value is PostType {
  return typeof value === "string" && (POST_TYPES as readonly string[]).includes(value);
}

export function isTone(value: unknown): value is Tone {
  return typeof value === "string" && (TONES as readonly string[]).includes(value);
}

export function isRefineAction(value: unknown): value is RefineAction {
  return typeof value === "string" && (REFINE_ACTIONS as readonly string[]).includes(value);
}
