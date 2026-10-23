// RevenueCat: lettura dello stato autorevole del subscriber e mappatura su piano/stato.
// Usiamo sempre GET /v1/subscribers (fonte di verità) invece del payload del webhook:
// è robusto rispetto a eventi duplicati o fuori ordine.

import type { PlanId, SubscriptionDTO, SubscriptionStatus } from "./domain/index.ts";
import { PLAN_RANK } from "./domain/index.ts";
import { AppError, log } from "./http.ts";

/** Identificatori degli entitlement configurati nella dashboard RevenueCat. */
export const ENTITLEMENT_TO_PLAN: Record<string, PlanId> = {
  base: "base",
  standard: "standard",
  pro: "pro",
};

export interface RcEntitlement {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  product_identifier: string;
  purchase_date: string;
}

export interface RcSubscription {
  expires_date: string | null;
  purchase_date: string;
  period_type?: "normal" | "trial" | "intro" | "prepaid" | string;
  store: string;
  is_sandbox: boolean;
  unsubscribe_detected_at: string | null;
  billing_issues_detected_at: string | null;
  grace_period_expires_date?: string | null;
  refunded_at?: string | null;
}

export interface RcSubscriber {
  entitlements: Record<string, RcEntitlement>;
  subscriptions: Record<string, RcSubscription>;
}

export interface SubscriptionState {
  plan: PlanId | null;
  status: SubscriptionStatus;
  productId: string | null;
  store: string | null;
  isSandbox: boolean;
  currentPeriodStart: string | null;
  expiresAt: string | null;
  willRenew: boolean;
  billingIssueDetectedAt: string | null;
}

const FAR_FUTURE = Date.UTC(9999, 0, 1);

function ms(date: string | null | undefined): number | null {
  if (!date) return null;
  const t = Date.parse(date);
  return Number.isNaN(t) ? null : t;
}

function effectiveExpiry(e: RcEntitlement): number {
  const base = e.expires_date === null ? FAR_FUTURE : (ms(e.expires_date) ?? 0);
  return Math.max(base, ms(e.grace_period_expires_date) ?? 0);
}

export const NO_SUBSCRIPTION: SubscriptionState = {
  plan: null,
  status: "none",
  productId: null,
  store: null,
  isSandbox: false,
  currentPeriodStart: null,
  expiresAt: null,
  willRenew: false,
  billingIssueDetectedAt: null,
};

export function deriveSubscriptionState(subscriber: RcSubscriber, now: Date = new Date()): SubscriptionState {
  const nowMs = now.getTime();
  const candidates = Object.entries(subscriber.entitlements ?? {})
    .flatMap(([id, ent]) => {
      const plan = ENTITLEMENT_TO_PLAN[id];
      return plan ? [{ plan, ent, expiry: effectiveExpiry(ent) }] : [];
    });
  if (candidates.length === 0) return NO_SUBSCRIPTION;

  const active = candidates
    .filter((c) => c.expiry > nowMs)
    .sort((a, b) => PLAN_RANK[b.plan] - PLAN_RANK[a.plan] || b.expiry - a.expiry);
  const chosen = active[0] ?? [...candidates].sort((a, b) => b.expiry - a.expiry)[0]!;
  const sub = subscriber.subscriptions?.[chosen.ent.product_identifier];
  const isActive = active.length > 0;

  let status: SubscriptionStatus;
  if (!isActive) status = "expired";
  else if (sub?.billing_issues_detected_at && (ms(sub.expires_date) ?? FAR_FUTURE) <= nowMs) status = "in_grace_period";
  else if (sub?.unsubscribe_detected_at) status = "cancelled";
  else if (sub?.period_type === "trial") status = "trial";
  else status = "active";

  return {
    plan: chosen.plan,
    status,
    productId: chosen.ent.product_identifier,
    store: sub?.store ?? null,
    isSandbox: sub?.is_sandbox ?? false,
    currentPeriodStart: sub?.purchase_date ?? chosen.ent.purchase_date,
    // Entitlement senza scadenza (promo/lifetime): data lontana, così SQL e app concordano sull'accesso.
    expiresAt: new Date(chosen.expiry).toISOString(),
    willRenew: isActive && !sub?.unsubscribe_detected_at && !sub?.refunded_at,
    billingIssueDetectedAt: sub?.billing_issues_detected_at ?? null,
  };
}

export async function fetchSubscriber(appUserId: string, secretApiKey: string): Promise<RcSubscriber> {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${secretApiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    log("error", "revenuecat_fetch_failed", { status: res.status });
    throw new AppError("internal", undefined, "Impossibile verificare l'abbonamento. Riprova.");
  }
  const body = (await res.json()) as { subscriber?: RcSubscriber };
  if (!body.subscriber) throw new AppError("internal");
  return body.subscriber;
}

export function toSubscriptionDTO(state: SubscriptionState, now = new Date()): SubscriptionDTO {
  const hasAccess = state.plan !== null && state.status !== "none" && state.status !== "expired" &&
    (state.expiresAt === null || Date.parse(state.expiresAt) > now.getTime());
  return {
    plan: state.plan,
    status: state.status,
    hasAccess,
    expiresAt: state.expiresAt,
    willRenew: state.willRenew,
    store: state.store,
  };
}
