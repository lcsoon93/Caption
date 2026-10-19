import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { AiCallError } from "../_shared/ai.ts";
import { AppError } from "../_shared/http.ts";
import { PlanChangedError } from "../_shared/store.ts";
import { createHandler } from "../generate-captions/handler.ts";
import { FakeModel, FakeStore, okResult, post, USER } from "./fakes.ts";

function setup(texts = ["uno", "due", "tre", "quattro", "cinque"]) {
  const store = new FakeStore();
  const model = new FakeModel(okResult(texts));
  const handler = createHandler({ authenticate: () => Promise.resolve(USER), store, model });
  return { store, model, handler };
}

Deno.test("genera caption per un piano Standard e restituisce l'utilizzo", async () => {
  const { handler, store, model } = setup();
  const res = await handler(post({ action: "generate", postType: "viaggio", tone: "ironico", context: "Lisbona" }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.captions.length, 5);
  assertEquals(body.usage, {
    plan: "standard",
    used: 1,
    limit: 150,
    remaining: 149,
    periodStart: "2026-10-01T00:00:00.000Z",
    periodEnd: "2026-11-01T00:00:00.000Z",
  });
  assertEquals(store.reserves[0]!.enforcedLimit, 150);
  assertStringIncludes(model.messages[0]!, "<contesto_utente>\nLisbona\n</contesto_utente>");
  assertEquals(store.completed[0]!.costMicros, 200 * 2 + 400 * 10 + 1500 * 0.2);
});

Deno.test("senza abbonamento: 402 no_subscription e nessuna chiamata AI", async () => {
  const { handler, store, model } = setup();
  store.sub = { plan: null, status: "none", expiresAt: null };
  const res = await handler(post({ action: "generate", postType: "cibo", tone: "soft" }));
  assertEquals(res.status, 402);
  assertEquals((await res.json()).error.code, "no_subscription");
  assertEquals(model.messages.length, 0);
});

Deno.test("abbonamento scaduto: 402 subscription_expired", async () => {
  const { handler, store } = setup();
  store.sub = { plan: "pro", status: "active", expiresAt: new Date(Date.now() - 1000).toISOString() };
  const res = await handler(post({ action: "generate", postType: "cibo", tone: "soft" }));
  assertEquals((await res.json()).error.code, "subscription_expired");
});

Deno.test("Base non può usare toni avanzati né rifiniture", async () => {
  const { handler, store } = setup();
  store.sub!.plan = "base";
  const res = await handler(post({ action: "generate", postType: "selfie", tone: "sarcastico" }));
  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error.details.requiredPlan, "standard");

  store.captions.push({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    user_id: USER,
    generation_id: "g",
    parent_caption_id: null,
    post_type: "selfie",
    tone: "diretto",
    refine_action: null,
    text: "x",
    hashtags: [],
    position: 0,
    is_favorite: false,
    created_at: "",
  });
  const r2 = await handler(
    post({ action: "refine", captionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", refineAction: "shorter" }),
  );
  assertEquals(r2.status, 403);
});

Deno.test("hashtag solo per Pro", async () => {
  const { handler, store, model } = setup();
  model.next = okResult(["a uno", "b due", "c tre", "d quattro", "e cinque"], ["#Viaggio", "mare"]);
  await handler(post({ action: "generate", postType: "viaggio", tone: "soft", includeHashtags: true }));
  assertStringIncludes(model.messages[0]!, "hashtag: no");
  assertEquals(store.completed[0]!.captions[0]!.hashtags, []);

  store.sub!.plan = "pro";
  model.next = okResult(["a", "b", "c", "d", "e", "f"], ["#Viaggio", "mare"]);
  const res = await handler(post({ action: "generate", postType: "viaggio", tone: "soft", includeHashtags: true }));
  const body = await res.json();
  assertEquals(body.captions.length, 6);
  assertEquals(body.captions[0].hashtags, ["#viaggio", "#mare"]);
  assertEquals(body.usage.limit, null);
  assertEquals(body.usage.remaining, null);
});

Deno.test("errore AI: credito rimborsato e 503", async () => {
  const { handler, store, model } = setup();
  model.next = () => Promise.reject(new AiCallError("ai_unavailable"));
  const res = await handler(post({ action: "generate", postType: "cibo", tone: "soft" }));
  assertEquals(res.status, 503);
  assertEquals(store.failed.length, 1);
  assertEquals(store.used, 0);
});

Deno.test("output troppo povero: ai_bad_output con costo contabilizzato", async () => {
  const { handler, store, model } = setup();
  model.next = okResult(["solo una"]);
  const res = await handler(post({ action: "generate", postType: "cibo", tone: "soft" }));
  assertEquals(res.status, 502);
  assert(store.failed[0]!.cost > 0);
});

Deno.test("quota esaurita dal DB: 402 quota_exceeded", async () => {
  const { handler, store, model } = setup();
  store.reserveError = new AppError("quota_exceeded", { used: 150, limit: 150 });
  const res = await handler(post({ action: "generate", postType: "cibo", tone: "soft" }));
  assertEquals(res.status, 402);
  assertEquals((await res.json()).error.code, "quota_exceeded");
  assertEquals(model.messages.length, 0);
});

Deno.test("rate limit: 429 con Retry-After", async () => {
  const { handler, store } = setup();
  store.reserveError = new AppError("rate_limited", { retryAfterSeconds: 60 });
  const res = await handler(post({ action: "generate", postType: "cibo", tone: "soft" }));
  assertEquals(res.status, 429);
  assertEquals(res.headers.get("Retry-After"), "60");
});

Deno.test("piano cambiato durante la prenotazione: un nuovo tentativo", async () => {
  const { handler, store } = setup();
  store.reserveError = new PlanChangedError();
  const res = await handler(post({ action: "generate", postType: "cibo", tone: "soft" }));
  assertEquals(res.status, 200);
  assertEquals(store.reserves.length, 2);
});

Deno.test("rifinitura Standard: una caption figlia", async () => {
  const { handler, store, model } = setup();
  store.captions.push({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    user_id: USER,
    generation_id: "g",
    parent_caption_id: null,
    post_type: "cibo",
    tone: "ironico",
    refine_action: null,
    text: "La carbonara non giudica.",
    hashtags: [],
    position: 0,
    is_favorite: false,
    created_at: "",
  });
  model.next = okResult(["Carbonara: zero giudizi."]);
  const res = await handler(
    post({ action: "refine", captionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", refineAction: "shorter" }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.captions.length, 1);
  assertEquals(body.captions[0].parentCaptionId, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  assertStringIncludes(model.messages[0]!, "<caption_originale>\nLa carbonara non giudica.\n</caption_originale>");
});

Deno.test("rifinitura di una caption di un altro utente: 404", async () => {
  const { handler } = setup();
  const res = await handler(
    post({ action: "refine", captionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", refineAction: "shorter" }),
  );
  assertEquals(res.status, 404);
});

Deno.test("input non valido: 400", async () => {
  const { handler } = setup();
  assertEquals((await handler(post({ action: "generate", postType: "x", tone: "soft" }))).status, 400);
  assertEquals((await handler(post({ action: "boom" }))).status, 400);
  const bad = new Request("http://x", { method: "POST", body: "{", headers: { Authorization: "Bearer t" } });
  assertEquals((await handler(bad)).status, 400);
});

Deno.test("non autenticato: 401", async () => {
  const store = new FakeStore();
  const handler = createHandler({
    authenticate: () => Promise.reject(new AppError("unauthorized")),
    store,
    model: new FakeModel(okResult([])),
  });
  assertEquals((await handler(post({ action: "generate", postType: "cibo", tone: "soft" }))).status, 401);
});
