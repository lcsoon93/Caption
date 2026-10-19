// Contratto HTTP tra app e Edge Functions + validazione senza dipendenze.

import type { PostType, RefineAction, Tone } from "./catalog.ts";
import { CONTEXT_MAX_LENGTH, isPostType, isRefineAction, isTone } from "./catalog.ts";
import type { PlanId } from "./plans.ts";

export interface GenerateRequest {
  action: "generate";
  postType: PostType;
  tone: Tone;
  context?: string;
  /** Solo Pro: ignorato (e rimosso) per gli altri piani. */
  includeHashtags?: boolean;
}

export interface RefineRequest {
  action: "refine";
  captionId: string;
  refineAction: RefineAction;
}

export type CaptionRequest = GenerateRequest | RefineRequest;

export interface CaptionDTO {
  id: string;
  text: string;
  hashtags: string[];
  postType: PostType;
  tone: Tone;
  refineAction: RefineAction | null;
  parentCaptionId: string | null;
  createdAt: string;
}

export interface UsageDTO {
  plan: PlanId;
  used: number;
  /** `null` = illimitato (Pro). */
  limit: number | null;
  remaining: number | null;
  periodStart: string;
  periodEnd: string | null;
}

export interface GenerateResponse {
  generationId: string;
  captions: CaptionDTO[];
  usage: UsageDTO;
}

export type SubscriptionStatus =
  | "active"
  | "trial"
  | "cancelled"
  | "in_grace_period"
  | "expired"
  | "none";

export interface SubscriptionDTO {
  plan: PlanId | null;
  status: SubscriptionStatus;
  hasAccess: boolean;
  expiresAt: string | null;
  willRenew: boolean;
  store: string | null;
}

export interface SyncSubscriptionResponse {
  subscription: SubscriptionDTO;
}

export const API_ERROR_CODES = [
  "unauthorized",
  "invalid_request",
  "no_subscription",
  "subscription_expired",
  "feature_not_in_plan",
  "quota_exceeded",
  "rate_limited",
  "budget_exceeded",
  "not_found",
  "content_refused",
  "ai_unavailable",
  "ai_bad_output",
  "internal",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** Messaggi pronti per l'utente (l'app può sovrascriverli). */
export const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  unauthorized: "Sessione scaduta. Accedi di nuovo.",
  invalid_request: "Richiesta non valida.",
  no_subscription: "Serve un abbonamento attivo per generare caption.",
  subscription_expired: "Il tuo abbonamento è scaduto. Rinnovalo per continuare.",
  feature_not_in_plan: "Questa funzione non è inclusa nel tuo piano.",
  quota_exceeded: "Hai esaurito le caption di questo mese.",
  rate_limited: "Stai andando veloce! Riprova tra qualche secondo.",
  budget_exceeded: "Servizio momentaneamente non disponibile. Riprova più tardi.",
  not_found: "Contenuto non trovato.",
  content_refused: "Non possiamo generare caption per questo contenuto. Prova a riformulare.",
  ai_unavailable: "Il nostro copywriter è sovraccarico. Riprova tra poco.",
  ai_bad_output: "Qualcosa è andato storto nella generazione. Non ti abbiamo scalato crediti.",
  internal: "Errore imprevisto. Riprova.",
};

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Normalizza il contesto: spazi compressi, caratteri di controllo rimossi, lunghezza limitata. */
export function normalizeContext(raw: string): string {
  return raw
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, CONTEXT_MAX_LENGTH);
}

export function parseCaptionRequest(input: unknown): ValidationResult<CaptionRequest> {
  if (typeof input !== "object" || input === null) return { ok: false, error: "body must be an object" };
  const body = input as Record<string, unknown>;

  if (body.action === "generate") {
    if (!isPostType(body.postType)) return { ok: false, error: "postType non valido" };
    if (!isTone(body.tone)) return { ok: false, error: "tone non valido" };
    if (body.context !== undefined && body.context !== null && typeof body.context !== "string") {
      return { ok: false, error: "context deve essere una stringa" };
    }
    if (typeof body.context === "string" && body.context.length > CONTEXT_MAX_LENGTH * 2) {
      return { ok: false, error: "context troppo lungo" };
    }
    if (body.includeHashtags !== undefined && typeof body.includeHashtags !== "boolean") {
      return { ok: false, error: "includeHashtags deve essere booleano" };
    }
    const context = typeof body.context === "string" ? normalizeContext(body.context) : "";
    return {
      ok: true,
      value: {
        action: "generate",
        postType: body.postType,
        tone: body.tone,
        ...(context ? { context } : {}),
        includeHashtags: body.includeHashtags === true,
      },
    };
  }

  if (body.action === "refine") {
    if (!isUuid(body.captionId)) return { ok: false, error: "captionId non valido" };
    if (!isRefineAction(body.refineAction)) return { ok: false, error: "refineAction non valida" };
    return { ok: true, value: { action: "refine", captionId: body.captionId, refineAction: body.refineAction } };
  }

  return { ok: false, error: "action deve essere 'generate' o 'refine'" };
}
