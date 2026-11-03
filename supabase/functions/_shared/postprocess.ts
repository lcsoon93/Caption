// Pulizia e validazione dell'output del modello prima di salvarlo/mostrarlo.

export interface CleanCaption {
  text: string;
  hashtags: string[];
}

const MAX_TEXT_LENGTH = 600;
const MAX_HASHTAGS = 10;
const HASHTAG_IN_TEXT = /(^|\s)#[\p{L}\p{N}_]+/gu;
const WRAPPING_QUOTES = /^["'“”«»‘’]+|["'“”«»‘’]+$/g;
/** Caption in italiano (o inglese): un alfabeto diverso è un errore del modello, non stile. */
const FOREIGN_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Thai}\p{Script=Devanagari}\p{Script=Greek}]/u;

export function normalizeHashtag(raw: string): string | null {
  const body = raw.trim().replace(/^#+/, "").toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "");
  if (FOREIGN_SCRIPT.test(body)) return null;
  if (body.length < 2 || body.length > 40) return null;
  return `#${body}`;
}

/** Converte la risposta grezza in caption pulite. Non lancia: restituisce ciò che è valido. */
export function sanitizeCaptions(
  raw: unknown,
  opts: { count: number; allowHashtags: boolean },
): CleanCaption[] {
  if (typeof raw !== "object" || raw === null) return [];
  const list = (raw as { captions?: unknown }).captions;
  if (!Array.isArray(list)) return [];

  const seen = new Set<string>();
  const out: CleanCaption[] = [];

  for (const item of list) {
    if (out.length >= opts.count) break;
    if (typeof item !== "object" || item === null) continue;
    const { text, hashtags } = item as { text?: unknown; hashtags?: unknown };
    if (typeof text !== "string") continue;

    const inlineTags = [...text.matchAll(HASHTAG_IN_TEXT)].map((m) => m[0].trim());
    const cleanText = text
      .replace(HASHTAG_IN_TEXT, "$1")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .replace(WRAPPING_QUOTES, "")
      .trim()
      .slice(0, MAX_TEXT_LENGTH);
    if (!cleanText || FOREIGN_SCRIPT.test(cleanText)) continue;

    const key = cleanText.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (seen.has(key)) continue;
    seen.add(key);

    let tags: string[] = [];
    if (opts.allowHashtags) {
      const candidates = [...(Array.isArray(hashtags) ? hashtags : []), ...inlineTags];
      tags = [
        ...new Set(
          candidates.filter((t): t is string => typeof t === "string").map(normalizeHashtag)
            .filter((t): t is string => t !== null),
        ),
      ].slice(0, MAX_HASHTAGS);
    }

    out.push({ text: cleanText, hashtags: tags });
  }
  return out;
}

/** Numero minimo di caption valide per considerare riuscita una generazione. */
export function minimumAcceptable(requested: number): number {
  return requested <= 1 ? 1 : Math.max(2, Math.ceil(requested / 2));
}
