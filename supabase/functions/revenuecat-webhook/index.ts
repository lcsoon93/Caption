import { requireEnv } from "../_shared/env.ts";
import { fetchSubscriber } from "../_shared/revenuecat.ts";
import { getAdminClient, upsertSubscription } from "../_shared/store.ts";
import { createWebhookHandler } from "./handler.ts";

const client = getAdminClient();
const rcSecret = requireEnv("REVENUECAT_SECRET_API_KEY");

Deno.serve(createWebhookHandler({
  webhookSecret: requireEnv("REVENUECAT_WEBHOOK_AUTH"),
  fetchSubscriber: (id) => fetchSubscriber(id, rcSecret),
  async eventAlreadyProcessed(eventId) {
    const { data, error } = await client.from("revenuecat_events").select("id").eq("id", eventId).maybeSingle();
    if (error) throw error;
    return data !== null;
  },
  async markEventProcessed(event) {
    const { error } = await client.from("revenuecat_events").upsert({
      id: event.id,
      type: event.type,
      app_user_id: event.app_user_id ?? null,
      environment: event.environment ?? null,
    });
    if (error) throw error;
  },
  async existingUsers(ids) {
    if (ids.length === 0) return [];
    const { data, error } = await client.from("subscriptions").select("user_id").in("user_id", ids);
    if (error) throw error;
    return (data ?? []).map((r: { user_id: string }) => r.user_id);
  },
  saveSubscription: (userId, state, eventId) => upsertSubscription(client, userId, state, eventId),
}));
