// POST /functions/v1/delete-account
// Richiesto da App Store / Play Store. Cancella l'utente: profili, abbonamento,
// storico e ledger vengono eliminati a cascata. L'abbonamento sullo store va
// disdetto dall'utente (l'app lo spiega prima di confermare).

import { bearerToken, corsHeaders, errorResponse, json, log } from "../_shared/http.ts";
import { authenticate, getAdminClient } from "../_shared/store.ts";

const client = getAdminClient();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const userId = await authenticate(client, bearerToken(req));
    const { error } = await client.auth.admin.deleteUser(userId);
    if (error) throw error;
    log("info", "account_deleted", { userId });
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
