// POST /functions/v1/generate-captions
// Body: { action: "generate", postType, tone, context?, includeHashtags? }
//     | { action: "refine", captionId, refineAction }

import { createAnthropicModel } from "../_shared/ai.ts";
import { loadAiConfig } from "../_shared/env.ts";
import { createGeminiModel, loadGeminiConfig } from "../_shared/gemini.ts";
import { bearerToken } from "../_shared/http.ts";
import { authenticate, createSupabaseStore, getAdminClient } from "../_shared/store.ts";
import { createHandler } from "./handler.ts";

const client = getAdminClient();

const handler = createHandler({
  authenticate: (req) => authenticate(client, bearerToken(req)),
  store: createSupabaseStore(client),
  // AI_PROVIDER=gemini solo per sviluppo/test; in produzione Claude (default).
  model: Deno.env.get("AI_PROVIDER") === "gemini"
    ? createGeminiModel(loadGeminiConfig())
    : createAnthropicModel(loadAiConfig()),
});

Deno.serve(handler);
