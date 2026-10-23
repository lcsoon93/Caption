import type { CaptionDTO, PostType, RefineAction, Tone } from "@caption/shared";
import { isPostType, isTone } from "@caption/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { analytics } from "@/lib/analytics";
import { api, CaptionApiError } from "@/lib/api";
import { storage } from "@/lib/storage";
import { useSession } from "@/providers/SessionProvider";

export type GeneratorPhase = "idle" | "generating" | "done";

interface Options {
  onError(error: CaptionApiError, context: { action: "generate" | "refine"; refineAction?: RefineAction }): void;
}

function toApiError(err: unknown): CaptionApiError {
  return err instanceof CaptionApiError ? err : new CaptionApiError("internal", "Errore imprevisto. Riprova.");
}

export function useCaptionGenerator({ onError }: Options) {
  const { applyUsage } = useSession();
  const [postType, setPostType] = useState<PostType>("selfie");
  const [tone, setTone] = useState<Tone>("diretto");
  const [context, setContext] = useState("");
  const [includeHashtags, setIncludeHashtags] = useState(false);
  const [captions, setCaptions] = useState<CaptionDTO[]>([]);
  const [phase, setPhase] = useState<GeneratorPhase>("idle");
  const [error, setError] = useState<CaptionApiError | null>(null);
  const [refining, setRefining] = useState<{ captionId: string; action: RefineAction } | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Ripristina l'ultima combinazione usata: chi posta spesso usa sempre gli stessi mood.
  useEffect(() => {
    void storage.getLastSelection().then((last) => {
      if (isPostType(last.postType)) setPostType(last.postType);
      if (isTone(last.tone)) setTone(last.tone);
    });
  }, []);

  const generate = useCallback(async () => {
    if (phase === "generating") return;
    setPhase("generating");
    setError(null);
    const started = Date.now();
    const trimmed = context.trim();
    analytics.track("generate_requested", { postType, tone, hasContext: trimmed.length > 0, includeHashtags });
    try {
      const res = await api.generate({ postType, tone, ...(trimmed ? { context: trimmed } : {}), includeHashtags });
      setCaptions(res.captions);
      applyUsage(res.usage);
      setPhase("done");
      void storage.setLastSelection({ postType, tone });
      analytics.track("generate_succeeded", { postType, tone, count: res.captions.length, clientLatencyMs: Date.now() - started });
    } catch (err) {
      const apiError = toApiError(err);
      setError(apiError);
      setPhase(captions.length ? "done" : "idle");
      analytics.track("generate_failed", { code: apiError.code });
      onErrorRef.current(apiError, { action: "generate" });
    }
  }, [phase, context, postType, tone, includeHashtags, applyUsage, captions.length]);

  const refine = useCallback(async (caption: CaptionDTO, action: RefineAction) => {
    if (refining) return;
    setRefining({ captionId: caption.id, action });
    setError(null);
    analytics.track("refine_requested", { action, tone: caption.tone });
    try {
      const res = await api.refine({ captionId: caption.id, refineAction: action });
      applyUsage(res.usage);
      // La versione rifinita compare subito sotto l'originale.
      setCaptions((prev) => {
        const i = prev.findIndex((c) => c.id === caption.id);
        const next = [...prev];
        next.splice(i < 0 ? next.length : i + 1, 0, ...res.captions);
        return next;
      });
    } catch (err) {
      const apiError = toApiError(err);
      setError(apiError);
      onErrorRef.current(apiError, { action: "refine", refineAction: action });
    } finally {
      setRefining(null);
    }
  }, [refining, applyUsage]);

  return {
    postType,
    setPostType,
    tone,
    setTone,
    context,
    setContext,
    includeHashtags,
    setIncludeHashtags,
    captions,
    phase,
    error,
    clearError: () => setError(null),
    refining,
    generate,
    refine,
  };
}
