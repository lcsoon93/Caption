import { assertEquals } from "jsr:@std/assert@1";
import type { RcSubscriber } from "../_shared/revenuecat.ts";
import { deriveSubscriptionState, toSubscriptionDTO } from "../_shared/revenuecat.ts";
import { affectedUserIds, createWebhookHandler } from "../revenuecat-webhook/handler.ts";

const NOW = new Date("2026-10-19T12:00:00Z");
const sub = (over: Partial<RcSubscriber["subscriptions"][string]> = {}) => ({
  expires_date: "2026-11-01T00:00:00Z",
  purchase_date: "2026-10-01T00:00:00Z",
  period_type: "normal",
  store: "app_store",
  is_sandbox: false,
  unsubscribe_detected_at: null,
  billing_issues_detected_at: null,
  ...over,
});

Deno.test("nessun entitlement => none", () => {
  const s = deriveSubscriptionState({ entitlements: {}, subscriptions: {} }, NOW);
  assertEquals(s.status, "none");
  assertEquals(toSubscriptionDTO(s, NOW).hasAccess, false);
});

Deno.test("sceglie il piano più alto attivo", () => {
  const s = deriveSubscriptionState({
    entitlements: {
      base: {
        expires_date: "2026-12-01T00:00:00Z",
        product_identifier: "caption_base_monthly",
        purchase_date: "2026-10-01T00:00:00Z",
      },
      pro: {
        expires_date: "2026-11-01T00:00:00Z",
        product_identifier: "caption_pro_monthly",
        purchase_date: "2026-10-01T00:00:00Z",
      },
    },
    subscriptions: { caption_pro_monthly: sub(), caption_base_monthly: sub() },
  }, NOW);
  assertEquals(s.plan, "pro");
  assertEquals(s.status, "active");
  assertEquals(s.currentPeriodStart, "2026-10-01T00:00:00Z");
  assertEquals(toSubscriptionDTO(s, NOW).hasAccess, true);
});

Deno.test("disdetto ma ancora valido => cancelled con accesso", () => {
  const s = deriveSubscriptionState({
    entitlements: {
      standard: {
        expires_date: "2026-11-01T00:00:00Z",
        product_identifier: "p",
        purchase_date: "2026-10-01T00:00:00Z",
      },
    },
    subscriptions: { p: sub({ unsubscribe_detected_at: "2026-10-10T00:00:00Z" }) },
  }, NOW);
  assertEquals(s.status, "cancelled");
  assertEquals(s.willRenew, false);
  assertEquals(toSubscriptionDTO(s, NOW).hasAccess, true);
});

Deno.test("problema di pagamento in grace period => accesso fino a fine grace", () => {
  const s = deriveSubscriptionState({
    entitlements: {
      base: {
        expires_date: "2026-10-18T00:00:00Z",
        grace_period_expires_date: "2026-10-25T00:00:00Z",
        product_identifier: "p",
        purchase_date: "2026-09-18T00:00:00Z",
      },
    },
    subscriptions: {
      p: sub({ expires_date: "2026-10-18T00:00:00Z", billing_issues_detected_at: "2026-10-18T00:00:00Z" }),
    },
  }, NOW);
  assertEquals(s.status, "in_grace_period");
  assertEquals(s.expiresAt, "2026-10-25T00:00:00.000Z");
});

Deno.test("scaduto => expired senza accesso", () => {
  const s = deriveSubscriptionState({
    entitlements: {
      standard: {
        expires_date: "2026-10-01T00:00:00Z",
        product_identifier: "p",
        purchase_date: "2026-09-01T00:00:00Z",
      },
    },
    subscriptions: { p: sub({ expires_date: "2026-10-01T00:00:00Z" }) },
  }, NOW);
  assertEquals(s.status, "expired");
  assertEquals(toSubscriptionDTO(s, NOW).hasAccess, false);
});

Deno.test("trial", () => {
  const s = deriveSubscriptionState({
    entitlements: {
      pro: { expires_date: "2026-10-22T00:00:00Z", product_identifier: "p", purchase_date: "2026-10-15T00:00:00Z" },
    },
    subscriptions: { p: sub({ period_type: "trial" }) },
  }, NOW);
  assertEquals(s.status, "trial");
});

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

Deno.test("affectedUserIds include trasferimenti e ignora id anonimi", () => {
  assertEquals(
    affectedUserIds({
      id: "e",
      type: "TRANSFER",
      app_user_id: "$RCAnonymousID:abc",
      transferred_from: [U1],
      transferred_to: [U2, "$RCAnonymousID:x"],
    }),
    [U1, U2],
  );
});

Deno.test("webhook: auth, idempotenza e sync", async () => {
  const saved: string[] = [];
  const processed = new Set<string>();
  const handler = createWebhookHandler({
    webhookSecret: "s3cret",
    fetchSubscriber: () => Promise.resolve({ entitlements: {}, subscriptions: {} }),
    eventAlreadyProcessed: (id) => Promise.resolve(processed.has(id)),
    markEventProcessed: (e) => {
      processed.add(e.id);
      return Promise.resolve();
    },
    existingUsers: (ids) => Promise.resolve(ids.filter((i) => i === U1)),
    saveSubscription: (u) => {
      saved.push(u);
      return Promise.resolve();
    },
  });
  const req = (auth: string) =>
    new Request("http://x", {
      method: "POST",
      headers: { Authorization: auth },
      body: JSON.stringify({ event: { id: "evt1", type: "EXPIRATION", app_user_id: U1 } }),
    });
  assertEquals((await handler(req("wrong"))).status, 401);
  assertEquals((await (await handler(req("s3cret"))).json()).synced, 1);
  assertEquals((await (await handler(req("Bearer s3cret"))).json()).duplicate, true);
  assertEquals(saved, [U1]);
});

Deno.test("entitlement senza scadenza (promo) => accesso con data lontana", () => {
  const s = deriveSubscriptionState({
    entitlements: {
      pro: { expires_date: null, product_identifier: "rc_promo_pro_lifetime", purchase_date: "2026-10-01T00:00:00Z" },
    },
    subscriptions: {},
  }, NOW);
  assertEquals(s.status, "active");
  assertEquals(s.expiresAt, "9999-01-01T00:00:00.000Z");
  assertEquals(toSubscriptionDTO(s, NOW).hasAccess, true);
});
