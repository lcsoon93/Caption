// POST /functions/v1/generate-captions
// Body: { action: "generate", postType, tone, context?, includeHashtags? }
//     | { action: "refine", captionId, refineAction }

import { createAnthropicModel } from "../_shared/ai.ts";
import { loadAiConfig } from "../_shared/env.ts";
import { createGeminiModel, loadGeminiConfig } from "../_shared/gemini.ts";
import { createGroqModel, loadGroqConfig } from "../_shared/groq.ts";
import { bearerToken } from "../_shared/http.ts";
import { authenticate, createSupabaseStore, getAdminClient } from "../_shared/store.ts";
import { createHandler } from "./handler.ts";
import type { CaptionModel } from "../_shared/ai.ts";

const client = getAdminClient();

// AI_PROVIDER: anthropic (default, versione pubblica) | groq (beta chiusa) | gemini (solo sviluppo).
function createModel(): CaptionModel {
  switch (Deno.env.get("AI_PROVIDER")) {
    case "groq":
      return createGroqModel(loadGroqConfig());
    case "gemini":
      return createGeminiModel(loadGeminiConfig());
    default:
      return createAnthropicModel(loadAiConfig());
  }
}

const handler = createHandler({
  authenticate: (req) => authenticate(client, bearerToken(req)),
  store: createSupabaseStore(client),
  model: createModel(),
});

Deno.serve(handler);
