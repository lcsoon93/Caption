// Client tipizzato verso le Edge Functions. Nessuna chiave segreta lato app:
// la chiamata porta solo il JWT dell'utente.

import type {
  ApiErrorBody,
  ApiErrorCode,
  CaptionDTO,
  GenerateRequest,
  GenerateResponse,
  PlanId,
  RefineRequest,
  SubscriptionStatus,
  SyncSubscriptionResponse,
} from "@caption/shared";
import { API_ERROR_CODES, API_ERROR_MESSAGES, PLANS } from "@caption/shared";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export class CaptionApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CaptionApiError";
  }

  /** Errori che si risolvono con un (nuovo) abbonamento o un upgrade. */
  get needsPaywall(): boolean {
    return ["no_subscription", "subscription_expired", "quota_exceeded", "feature_not_in_plan"].includes(this.code);
  }

  get isRetryable(): boolean {
    return ["rate_limited", "ai_unavailable", "ai_bad_output", "internal"].includes(this.code);
  }
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && (API_ERROR_CODES as readonly string[]).includes(value);
}

async function invoke<T>(name: string, body?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body: body ?? {} });
  if (!error && data) return data;

  if (error instanceof FunctionsHttpError) {
    const payload = (await (error.context as Response).json().catch(() => null)) as ApiErrorBody | null;
    const code = isApiErrorCode(payload?.error?.code) ? payload.error.code : "internal";
    throw new CaptionApiError(code, payload?.error?.message ?? API_ERROR_MESSAGES[code], payload?.error?.details);
  }
  // Rete assente / timeout
  throw new CaptionApiError("ai_unavailable", "Connessione assente. Controlla la rete e riprova.");
}

export const api = {
  generate: (req: Omit<GenerateRequest, "action">) =>
    invoke<GenerateResponse>("generate-captions", { action: "generate", ...req }),

  refine: (req: Omit<RefineRequest, "action">) =>
    invoke<GenerateResponse>("generate-captions", { action: "refine", ...req }),

  syncSubscription: () => invoke<SyncSubscriptionResponse>("sync-subscription"),

  deleteAccount: () => invoke<{ ok: true }>("delete-account"),

  async status(): Promise<AccountStatus> {
    const { data, error } = await supabase.rpc("get_my_status").maybeSingle<StatusRow>();
    if (error) throw new CaptionApiError("internal", API_ERROR_MESSAGES.internal);
    if (!data) return EMPTY_STATUS;
    const limit = data.plan ? PLANS[data.plan].monthlyCredits : null;
    return {
      plan: data.plan,
      status: data.status,
      hasAccess: data.has_access,
      expiresAt: data.expires_at,
      willRenew: data.will_renew,
      used: data.credits_used,
      limit,
      remaining: limit === null ? null : Math.max(limit - data.credits_used, 0),
      periodEnd: data.period_end,
    };
  },

  async history(opts: { before?: string; limit?: number } = {}): Promise<CaptionDTO[]> {
    let query = supabase
      .from("captions")
      .select("id, text, hashtags, post_type, tone, refine_action, parent_caption_id, created_at")
      .order("created_at", { ascending: false })
      .limit(opts.limit ?? 30);
    if (opts.before) query = query.lt("created_at", opts.before);
    const { data, error } = await query;
    if (error) throw new CaptionApiError("internal", API_ERROR_MESSAGES.internal);
    return (data ?? []).map((r) => ({
      id: r.id,
      text: r.text,
      hashtags: r.hashtags ?? [],
      postType: r.post_type,
      tone: r.tone,
      refineAction: r.refine_action,
      parentCaptionId: r.parent_caption_id,
      createdAt: r.created_at,
    }));
  },

  async deleteCaption(id: string): Promise<void> {
    const { error } = await supabase.from("captions").delete().eq("id", id);
    if (error) throw new CaptionApiError("internal", API_ERROR_MESSAGES.internal);
  },
};

interface StatusRow {
  plan: PlanId | null;
  status: SubscriptionStatus;
  has_access: boolean;
  expires_at: string | null;
  will_renew: boolean;
  store: string | null;
  period_start: string;
  period_end: string | null;
  credits_used: number;
}

export interface AccountStatus {
  plan: PlanId | null;
  status: SubscriptionStatus;
  hasAccess: boolean;
  expiresAt: string | null;
  willRenew: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  periodEnd: string | null;
}

const EMPTY_STATUS: AccountStatus = {
  plan: null,
  status: "none",
  hasAccess: false,
  expiresAt: null,
  willRenew: false,
  used: 0,
  limit: null,
  remaining: null,
  periodEnd: null,
};
