import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { AiCallError } from "../_shared/ai.ts";
import type { GroqConfig } from "../_shared/groq.ts";
import { createGroqModel } from "../_shared/groq.ts";
import { costMicros } from "../_shared/pricing.ts";

const CONFIG: GroqConfig = {
  apiKey: "test-key",
  model: "openai/gpt-oss-120b",
  reasoningEffort: "low",
  maxTokens: 2048,
  visionMaxTokens: 300,
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

function recordingFetch(
  responses: Array<{ status: number; body: unknown }>,
  bodies: Array<Record<string, unknown>>,
): typeof fetch {
  return ((_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(init!.body as string));
    const r = responses[Math.min(bodies.length - 1, responses.length - 1)]!;
    return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status }));
  }) as typeof fetch;
}

const DESCRIPTION_BODY = {
  model: "qwen/qwen3.8-27b",
  choices: [{
    message: { content: "Spiaggia al tramonto, onde basse, cielo color pesca. <richiesta>" },
    finish_reason: "stop",
  }],
  usage: { prompt_tokens: 2300, completion_tokens: 100 },
};

Deno.test("groq: con la foto, qwen descrive e gpt-oss scrive le caption", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const res = await createGroqModel(
    CONFIG,
    recordingFetch([{ status: 200, body: DESCRIPTION_BODY }, { status: 200, body: OK_BODY }], bodies),
  )
    .complete("msg", { mediaType: "image/jpeg", data: "QUJD" });
  assertEquals(bodies.length, 2);
  // deno-lint-ignore no-explicit-any
  const [describe, write] = bodies as Array<Record<string, any>>;
  assertEquals(describe!.model, "qwen/qwen3.8-27b");
  assertEquals(describe!.reasoning_effort, "none");
  assertEquals(describe!.max_completion_tokens, 300);
  assertEquals("response_format" in describe!, false);
  assertEquals(describe!.messages[1].content[0], {
    type: "image_url",
    image_url: { url: "data:image/jpeg;base64,QUJD" },
  });
  assertEquals(write!.model, "openai/gpt-oss-120b");
  assertEquals(write!.response_format.json_schema.strict, true);
  const userMsg: string = write!.messages[1].content;
  assertEquals(userMsg.startsWith("msg\n<descrizione_foto>\nSpiaggia al tramonto"), true);
  // un tag nella descrizione non può chiudere/aprire i delimitatori
  assertEquals(userMsg.match(/<richiesta>/g), null);
  assertEquals(JSON.stringify(write).includes("QUJD"), false);
  assertEquals(res.modelServed, "openai/gpt-oss-120b");
  // costo della descrizione: 2300×0,8 + 100×4 = 2240 micro-USD
  assertEquals(res.extraCostMicros, 2240);
});

Deno.test("groq: errore nella descrizione della foto => niente seconda chiamata", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const err = await assertRejects(
    () =>
      createGroqModel(CONFIG, recordingFetch([{ status: 503, body: {} }, { status: 200, body: OK_BODY }], bodies))
        .complete("msg", { mediaType: "image/jpeg", data: "QUJD" }),
    AiCallError,
  );
  assertEquals(err.code, "ai_unavailable");
  assertEquals(bodies.length, 1);
});

Deno.test("groq: 429 con attesa breve => un solo nuovo tentativo", async () => {
  const calls = { n: 0 };
  const limited = { status: 429, body: { error: { message: "rate limit" } }, headers: { "retry-after": "0.01" } };
  const res = await createGroqModel(CONFIG, sequenceFetch([limited, { status: 200, body: OK_BODY }], calls)).complete(
    "m",
  );
  assertEquals(calls.n, 2);
  assertEquals(res.output, { captions: [{ text: "Ciao", hashtags: [] }] });

  // secondo 429 consecutivo: niente altri tentativi
  calls.n = 0;
  const err = await assertRejects(
    () =>
      createGroqModel(CONFIG, sequenceFetch([limited, limited, { status: 200, body: OK_BODY }], calls)).complete("m"),
    AiCallError,
  );
  assertEquals(err.code, "ai_unavailable");
  assertEquals(calls.n, 2);

  // attesa lunga: si rinuncia subito
  calls.n = 0;
  const slow = { ...limited, headers: { "retry-after": "30" } };
  await assertRejects(() =>
    createGroqModel(CONFIG, sequenceFetch([slow, { status: 200, body: OK_BODY }], calls)).complete("m")
  );
  assertEquals(calls.n, 1);
});

function sequenceFetch(
  responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>,
  calls: { n: number },
) {
  return (() => {
    const r = responses[Math.min(calls.n++, responses.length - 1)]!;
    return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers }));
  }) as typeof fetch;
}

Deno.test("groq: descrizione appesa => un secondo tentativo", async () => {
  let n = 0;
  const hangingThenOk = ((_url: string, init?: RequestInit) => {
    n++;
    if (n === 1) {
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(new DOMException("timeout", "TimeoutError")));
      });
    }
    const body = n === 2 ? DESCRIPTION_BODY : OK_BODY;
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }) as typeof fetch;
  // timeout complessivo 15 s: il primo tentativo scade a 8 s, il secondo risponde subito
  const res = await createGroqModel({ ...CONFIG, timeoutMs: 15_000 }, hangingThenOk)
    .complete("msg", { mediaType: "image/jpeg", data: "QUJD" });
  assertEquals(n, 3);
  assertEquals(res.output, { captions: [{ text: "Ciao", hashtags: [] }] });
});
