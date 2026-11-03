import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { AiCallError } from "../_shared/ai.ts";
import type { GroqConfig } from "../_shared/groq.ts";
import { createGroqModel } from "../_shared/groq.ts";
import { costMicros } from "../_shared/pricing.ts";

const CONFIG: GroqConfig = {
  apiKey: "test-key",
  model: "openai/gpt-oss-120b",
  reasoningEffort: "low",
  maxTokens: 4096,
  timeoutMs: 5000,
  priceInput: 0.15,
  priceOutput: 0.6,
  visionModel: "qwen/qwen3.8-27b",
  visionPriceInput: 0.8,
  visionPriceOutput: 4,
};

function fakeFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}): typeof fetch {
  return ((url: string, init?: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  }) as typeof fetch;
}

const OK_BODY = {
  model: "openai/gpt-oss-120b",
  choices: [{
    message: { role: "assistant", content: '{"captions":[{"text":"Ciao","hashtags":[]}]}' },
    finish_reason: "stop",
  }],
  usage: { prompt_tokens: 1200, completion_tokens: 300, prompt_tokens_details: { cached_tokens: 1000 } },
};

Deno.test("groq: richiesta OpenAI-compatibile con schema strict e chiave nell'header", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const res = await createGroqModel(CONFIG, fakeFetch(200, OK_BODY, seen)).complete("msg");
  assertEquals(seen.url, "https://api.groq.com/openai/v1/chat/completions");
  assertEquals((seen.init!.headers as Record<string, string>).Authorization, "Bearer test-key");
  const body = JSON.parse(seen.init!.body as string);
  assertEquals(body.model, "openai/gpt-oss-120b");
  assertEquals(body.response_format.type, "json_schema");
  assertEquals(body.response_format.json_schema.strict, true);
  assertEquals(body.reasoning_effort, "low");
  assertEquals(body.include_reasoning, false);
  assertEquals(body.messages[0].role, "system");
  assertEquals(body.messages[1], { role: "user", content: "msg" });
  assertEquals(res.output, { captions: [{ text: "Ciao", hashtags: [] }] });
  assertEquals(res.usage, { inputTokens: 200, outputTokens: 300, cacheReadTokens: 1000, cacheWriteTokens: 0 });
  // 200×0,15 + 300×0,6 + 1000×0,075 = 285 micro-USD
  assertEquals(costMicros(res.modelServed, res.usage), 285);
});

Deno.test("groq: parametri di ragionamento solo per i modelli gpt-oss", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  await createGroqModel({ ...CONFIG, model: "llama-3.3-70b-versatile" }, fakeFetch(200, OK_BODY, seen)).complete("m");
  const body = JSON.parse(seen.init!.body as string);
  assertEquals("reasoning_effort" in body, false);
  assertEquals("include_reasoning" in body, false);
});

Deno.test("groq: errori mappati sui codici dell'app", async () => {
  const code = async (status: number, body: unknown) => {
    const err = await assertRejects(() => createGroqModel(CONFIG, fakeFetch(status, body)).complete("m"), AiCallError);
    return err.code;
  };
  assertEquals(await code(429, {}), "ai_unavailable");
  assertEquals(await code(503, {}), "ai_unavailable");
  assertEquals(await code(400, { error: { code: "json_validate_failed" } }), "ai_bad_output");
  assertEquals(await code(401, {}), "internal");
  assertEquals(
    await code(200, { choices: [{ message: { content: null, refusal: "no" }, finish_reason: "stop" }] }),
    "content_refused",
  );
  assertEquals(
    await code(200, { choices: [{ message: { content: "" }, finish_reason: "content_filter" }] }),
    "content_refused",
  );
  assertEquals(await code(200, { choices: [{ message: { content: "{" }, finish_reason: "length" }] }), "ai_bad_output");
  assertEquals(
    await code(200, { choices: [{ message: { content: "non json" }, finish_reason: "stop" }] }),
    "ai_bad_output",
  );
});

Deno.test("groq: con la foto usa il modello visivo e la invia come data URI", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const reply = { ...OK_BODY, model: "qwen/qwen3.8-27b" };
  const res = await createGroqModel(CONFIG, fakeFetch(200, reply, seen))
    .complete("msg", { mediaType: "image/jpeg", data: "QUJD" });
  const body = JSON.parse(seen.init!.body as string);
  assertEquals(body.model, "qwen/qwen3.8-27b");
  assertEquals(body.reasoning_effort, "none");
  assertEquals("include_reasoning" in body, false);
  assertEquals(body.messages[1].content, [
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJD" } },
    { type: "text", text: "msg" },
  ]);
  // prezzo del modello visivo: 200×0,8 + 300×4 + 1000×0,4
  assertEquals(costMicros(res.modelServed, res.usage), 1760);
});
