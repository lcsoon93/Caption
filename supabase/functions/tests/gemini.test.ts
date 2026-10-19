import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { AiCallError } from "../_shared/ai.ts";
import type { GeminiConfig } from "../_shared/gemini.ts";
import { createGeminiModel } from "../_shared/gemini.ts";
import { costMicros } from "../_shared/pricing.ts";

const CONFIG: GeminiConfig = {
  apiKey: "test-key",
  model: "gemini-3.8-flash",
  thinkingLevel: "LOW",
  maxTokens: 4096,
  timeoutMs: 5000,
  priceInput: 0,
  priceOutput: 0,
};

function fakeFetch(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}): typeof fetch {
  return ((url: string, init?: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as typeof fetch;
}

const OK_BODY = {
  candidates: [{
    content: {
      parts: [{ text: "ragionamento", thought: true }, { text: '{"captions":[{"text":"Ciao","hashtags":[]}]}' }],
    },
    finishReason: "STOP",
  }],
  usageMetadata: {
    promptTokenCount: 1200,
    candidatesTokenCount: 300,
    thoughtsTokenCount: 80,
    cachedContentTokenCount: 1000,
  },
  modelVersion: "gemini-3.8-flash-001",
};

Deno.test("gemini: richiesta con schema JSON, thinking e chiave nell'header", async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const model = createGeminiModel(CONFIG, fakeFetch(200, OK_BODY, seen));
  const res = await model.complete("msg");
  assertEquals(seen.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  assertEquals((seen.init!.headers as Record<string, string>)["x-goog-api-key"], "test-key");
  const body = JSON.parse(seen.init!.body as string);
  assertEquals(body.generationConfig.responseMimeType, "application/json");
  assertEquals(body.generationConfig.thinkingConfig, { thinkingLevel: "LOW" });
  assertEquals(body.contents[0].parts[0].text, "msg");
  assertEquals(res.output, { captions: [{ text: "Ciao", hashtags: [] }] });
  assertEquals(res.usage, { inputTokens: 200, outputTokens: 380, cacheReadTokens: 1000, cacheWriteTokens: 0 });
  assertEquals(res.modelServed, "gemini-3.8-flash-001");
  // piano gratuito: costo zero anche con il suffisso di versione
  assertEquals(costMicros(res.modelServed, res.usage), 0);
});

Deno.test("gemini: errori mappati sui codici dell'app", async () => {
  const code = async (status: number, body: unknown) => {
    const err = await assertRejects(
      () => createGeminiModel(CONFIG, fakeFetch(status, body)).complete("m"),
      AiCallError,
    );
    return err.code;
  };
  assertEquals(await code(429, {}), "ai_unavailable");
  assertEquals(await code(503, {}), "ai_unavailable");
  assertEquals(await code(400, {}), "internal");
  assertEquals(await code(200, { promptFeedback: { blockReason: "SAFETY" } }), "content_refused");
  assertEquals(await code(200, { candidates: [{ finishReason: "PROHIBITED_CONTENT" }] }), "content_refused");
  assertEquals(await code(200, { candidates: [{ finishReason: "MAX_TOKENS" }] }), "ai_bad_output");
  assertEquals(
    await code(200, { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "non json" }] } }] }),
    "ai_bad_output",
  );
});
