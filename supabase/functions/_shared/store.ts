// Accesso al database dalle Edge Functions (service_role). Le regole critiche
// (quote, rate limit, budget, storico) sono applicate in modo atomico nelle RPC SQL.

import type { SupabaseClient } from "./deps.ts";
import { createClient } from "./deps.ts";
import type { ApiErrorCode, PlanId, PostType, RefineAction, SubscriptionStatus, Tone } from "./domain/index.ts";
import { AppError, log } from "./http.ts";
import { requireEnv } from "./env.ts";
import type { CleanCaption } from "./postprocess.ts";
import type { TokenUsage } from "./pricing.ts";
import type { SubscriptionState } from "./revenuecat.ts";

export interface SubscriptionRow {
  plan: PlanId | null;
  status: SubscriptionStatus;
  expiresAt: string | null;
}

export interface CaptionRow {
  id: string;
  user_id: string;
  generation_id: string;
  parent_caption_id: string | null;
  post_type: PostType;
  tone: Tone;
  refine_action: RefineAction | null;
  text: string;
  hashtags: string[];
  position: number;
  is_favorite: boolean;
  created_at: string;
}

export interface ReserveParams {
  userId: string;
  kind: "generate" | "refine";
  expectedPlan: PlanId;
  credits: number;
  enforcedLimit: number;
  visibleLimit: number | null;
  ratePerMinute: number;
  ratePerHour: number;
  periodCostCapMicros: number;
  postType: PostType;
  tone: Tone;
  refineAction: RefineAction | null;
  parentCaptionId: string | null;
  model: string;
  promptVersion: string;
}

export interface Reservation {
  generationId: string;
  creditsUsed: number;
  creditsLimit: number | null;
  periodStart: string;
  periodEnd: string | null;
}

export interface CompleteParams {
  generationId: string;
  captions: CleanCaption[];
  modelServed: string;
  usage: TokenUsage;
  costMicros: number;
  latencyMs: number;
  historyLimit: number | null;
}

export interface CaptionStore {
  getSubscription(userId: string): Promise<SubscriptionRow | null>;
  getCaption(userId: string, captionId: string): Promise<CaptionRow | null>;
  reserve(params: ReserveParams): Promise<Reservation>;
  complete(params: CompleteParams): Promise<CaptionRow[]>;
  fail(generationId: string, errorCode: string, usage: TokenUsage, costMicros: number): Promise<void>;
}

/** Errori applicativi sollevati da `raise_app_error` in SQL. */
const DB_ERROR_CODES = new Set<string>([
  "no_subscription",
  "subscription_expired",
  "quota_exceeded",
  "rate_limited",
  "budget_exceeded",
  "not_found",
  "ai_bad_output",
  "plan_changed",
]);

export class PlanChangedError extends Error {}

function mapDbError(error: { message: string; details?: string | null; code?: string }): Error {
  if (error.code === "P0001" || DB_ERROR_CODES.has(error.message)) {
    let details: Record<string, unknown> | undefined;
    try {
      details = error.details ? JSON.parse(error.details) : undefined;
    } catch {
      details = undefined;
    }
    if (error.message === "plan_changed") return new PlanChangedError();
    if (DB_ERROR_CODES.has(error.message)) return new AppError(error.message as ApiErrorCode, details);
  }
  log("error", "db_error", { message: error.message, code: error.code ?? null });
  return new AppError("internal");
}

let adminClient: SupabaseClient | undefined;

export function getAdminClient(): SupabaseClient {
  adminClient ??= createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/** Verifica il JWT dell'utente e restituisce il suo id. */
export async function authenticate(client: SupabaseClient, jwt: string): Promise<string> {
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data.user) throw new AppError("unauthorized");
  return data.user.id;
}

export function createSupabaseStore(client: SupabaseClient): CaptionStore {
  return {
    async getSubscription(userId) {
      const { data, error } = await client
        .from("subscriptions")
        .select("plan, status, expires_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw mapDbError(error);
      if (!data) return null;
      return { plan: data.plan, status: data.status, expiresAt: data.expires_at };
    },

    async getCaption(userId, captionId) {
      const { data, error } = await client
        .from("captions")
        .select("*")
        .eq("id", captionId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw mapDbError(error);
      return (data as CaptionRow | null) ?? null;
    },

    async reserve(p) {
      const { data, error } = await client.rpc("reserve_generation", {
        p_user_id: p.userId,
        p_kind: p.kind,
        p_expected_plan: p.expectedPlan,
        p_credits: p.credits,
        p_enforced_limit: p.enforcedLimit,
        p_visible_limit: p.visibleLimit,
        p_rate_per_minute: p.ratePerMinute,
        p_rate_per_hour: p.ratePerHour,
        p_period_cost_cap_micros: p.periodCostCapMicros,
        p_post_type: p.postType,
        p_tone: p.tone,
        p_refine_action: p.refineAction,
        p_parent_caption_id: p.parentCaptionId,
        p_model: p.model,
        p_prompt_version: p.promptVersion,
      });
      if (error) throw mapDbError(error);
      const row = (data as Array<Record<string, unknown>>)[0];
      if (!row) throw new AppError("internal");
      return {
        generationId: row.generation_id as string,
        creditsUsed: row.credits_used as number,
        creditsLimit: (row.credits_limit as number | null) ?? null,
        periodStart: row.period_start as string,
        periodEnd: (row.period_end as string | null) ?? null,
      };
    },

    async complete(p) {
      const { data, error } = await client.rpc("complete_generation", {
        p_generation_id: p.generationId,
        p_captions: p.captions,
        p_model_served: p.modelServed,
        p_input_tokens: p.usage.inputTokens,
        p_output_tokens: p.usage.outputTokens,
        p_cache_read_tokens: p.usage.cacheReadTokens,
        p_cache_write_tokens: p.usage.cacheWriteTokens,
        p_cost_micros: p.costMicros,
        p_latency_ms: p.latencyMs,
        p_history_limit: p.historyLimit,
      });
      if (error) throw mapDbError(error);
      return data as CaptionRow[];
    },

    async fail(generationId, errorCode, usage, cost) {
      const { error } = await client.rpc("fail_generation", {
        p_generation_id: generationId,
        p_error_code: errorCode,
        p_input_tokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
        p_output_tokens: usage.outputTokens,
        p_cost_micros: cost,
      });
      // Il rimborso non deve mascherare l'errore originale: logghiamo e proseguiamo.
      if (error) log("error", "fail_generation_error", { generationId, message: error.message });
    },
  };
}

export async function upsertSubscription(
  client: SupabaseClient,
  userId: string,
  state: SubscriptionState,
  eventId?: string,
): Promise<void> {
  const { error } = await client.from("subscriptions").upsert({
    user_id: userId,
    plan: state.plan,
    status: state.status,
    product_id: state.productId,
    store: state.store,
    is_sandbox: state.isSandbox,
    current_period_start: state.currentPeriodStart,
    expires_at: state.expiresAt,
    will_renew: state.willRenew,
    billing_issue_detected_at: state.billingIssueDetectedAt,
    last_synced_at: new Date().toISOString(),
    ...(eventId ? { last_event_id: eventId } : {}),
  });
  if (error) throw mapDbError(error);
}
