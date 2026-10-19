// Webhook RevenueCat → stato abbonamento in Supabase.
// Deploy con --no-verify-jwt: l'autenticazione è il segreto condiviso nell'header Authorization
// (impostato nella dashboard RevenueCat → Integrations → Webhooks).

import { isUuid } from "../_shared/domain/index.ts";
import { AppError, errorResponse, json, log, readJson, safeEqual } from "../_shared/http.ts";
import type { RcSubscriber, SubscriptionState } from "../_shared/revenuecat.ts";
import { deriveSubscriptionState } from "../_shared/revenuecat.ts";

export interface RcWebhookEvent {
  id: string;
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
  environment?: string;
}

export interface WebhookDeps {
  webhookSecret: string;
  fetchSubscriber(appUserId: string): Promise<RcSubscriber>;
  eventAlreadyProcessed(eventId: string): Promise<boolean>;
  markEventProcessed(event: RcWebhookEvent): Promise<void>;
  /** Filtra gli id che corrispondono a utenti esistenti. */
  existingUsers(ids: string[]): Promise<string[]>;
  saveSubscription(userId: string, state: SubscriptionState, eventId: string): Promise<void>;
}

/** Tutti gli id utente Supabase (UUID) coinvolti dall'evento, inclusi i trasferimenti. */
export function affectedUserIds(event: RcWebhookEvent): string[] {
  const ids = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
    ...(event.transferred_from ?? []),
    ...(event.transferred_to ?? []),
  ];
  return [...new Set(ids.filter(isUuid).map((id) => id.toLowerCase()))];
}

export function createWebhookHandler(deps: WebhookDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      if (req.method !== "POST") return json({ ok: false }, 405);
      const auth = req.headers.get("Authorization") ?? "";
      const provided = auth.replace(/^Bearer\s+/i, "");
      if (!deps.webhookSecret || !safeEqual(provided, deps.webhookSecret)) throw new AppError("unauthorized");

      const body = (await readJson(req)) as { event?: RcWebhookEvent };
      const event = body.event;
      if (!event?.id || !event.type) throw new AppError("invalid_request");

      if (event.type === "TEST") return json({ ok: true, test: true });
      if (await deps.eventAlreadyProcessed(event.id)) return json({ ok: true, duplicate: true });

      const users = await deps.existingUsers(affectedUserIds(event));
      for (const userId of users) {
        const state = deriveSubscriptionState(await deps.fetchSubscriber(userId));
        await deps.saveSubscription(userId, state, event.id);
        log("info", "subscription_synced", {
          source: "webhook",
          eventType: event.type,
          userId,
          plan: state.plan,
          status: state.status,
          sandbox: state.isSandbox,
        });
      }
      if (users.length === 0) log("warn", "webhook_no_matching_user", { eventType: event.type });

      await deps.markEventProcessed(event);
      return json({ ok: true, synced: users.length });
    } catch (err) {
      // Non-2xx => RevenueCat ritenta con backoff.
      return errorResponse(err);
    }
  };
}
