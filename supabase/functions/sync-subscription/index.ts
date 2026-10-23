// POST /functions/v1/sync-subscription
// Chiamata dall'app subito dopo acquisto/ripristino: non aspettiamo il webhook.

import type { SyncSubscriptionResponse } from "../_shared/domain/index.ts";
import { requireEnv } from "../_shared/env.ts";
import { bearerToken, corsHeaders, errorResponse, json, log } from "../_shared/http.ts";
import { deriveSubscriptionState, fetchSubscriber, toSubscriptionDTO } from "../_shared/revenuecat.ts";
import { authenticate, getAdminClient, upsertSubscription } from "../_shared/store.ts";

const client = getAdminClient();
const rcSecret = requireEnv("REVENUECAT_SECRET_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const userId = await authenticate(client, bearerToken(req));
    const state = deriveSubscriptionState(await fetchSubscriber(userId, rcSecret));
    await upsertSubscription(client, userId, state);
    log("info", "subscription_synced", { source: "client", userId, plan: state.plan, status: state.status });
    const body: SyncSubscriptionResponse = { subscription: toSubscriptionDTO(state) };
    return json(body);
  } catch (err) {
    return errorResponse(err);
  }
});
