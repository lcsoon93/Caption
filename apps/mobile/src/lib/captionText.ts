import type { CaptionDTO } from "@caption/shared";

/** Testo pronto da incollare su Instagram: caption + hashtag separati da una riga vuota. */
export function captionForClipboard(caption: Pick<CaptionDTO, "text" | "hashtags">): string {
  return caption.hashtags.length ? `${caption.text}\n\n${caption.hashtags.join(" ")}` : caption.text;
}
