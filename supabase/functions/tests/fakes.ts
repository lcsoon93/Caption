import type { CaptionModel, ModelResult } from "../_shared/ai.ts";
import type { PlanId, SubscriptionStatus } from "../_shared/domain/index.ts";
import type { CaptionRow, CaptionStore, CompleteParams, Reservation, ReserveParams } from "../_shared/store.ts";
import type { TokenUsage } from "../_shared/pricing.ts";

export const USER = "11111111-1111-4111-8111-111111111111";

export class FakeStore implements CaptionStore {
  sub: { plan: PlanId | null; status: SubscriptionStatus; expiresAt: string | null } | null = {
    plan: "standard",
    status: "active",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  };
  used = 0;
  captions: CaptionRow[] = [];
  reserves: ReserveParams[] = [];
  failed: Array<{ id: string; code: string; cost: number }> = [];
  completed: CompleteParams[] = [];
  reserveError: Error | null = null;

  getSubscription() {
    return Promise.resolve(this.sub);
  }
  getCaption(userId: string, id: string) {
    return Promise.resolve(this.captions.find((c) => c.id === id && c.user_id === userId) ?? null);
  }
  reserve(p: ReserveParams): Promise<Reservation> {
    this.reserves.push(p);
    if (this.reserveError) {
      const e = this.reserveError;
      this.reserveError = null;
      return Promise.reject(e);
    }
    this.used += p.credits;
    return Promise.resolve({
      generationId: `gen-${this.reserves.length}`,
      creditsUsed: this.used,
      creditsLimit: p.visibleLimit,
      periodStart: "2026-10-01T00:00:00.000Z",
      periodEnd: "2026-11-01T00:00:00.000Z",
    });
  }
  complete(p: CompleteParams): Promise<CaptionRow[]> {
    this.completed.push(p);
    const r = this.reserves.at(-1)!;
    const rows = p.captions.map((c, i): CaptionRow => ({
      id: `cap-${this.captions.length + i}`,
      user_id: r.userId,
      generation_id: p.generationId,
      parent_caption_id: r.parentCaptionId,
      post_type: r.postType,
      tone: r.tone,
      refine_action: r.refineAction,
      text: c.text,
      hashtags: c.hashtags,
      position: i,
      is_favorite: false,
      created_at: new Date().toISOString(),
    }));
    this.captions.push(...rows);
    return Promise.resolve(rows);
  }
  fail(id: string, code: string, _usage: TokenUsage, cost: number) {
    this.used -= 1;
    this.failed.push({ id, code, cost });
    return Promise.resolve();
  }
}

export class FakeModel implements CaptionModel {
  readonly model = "claude-sonnet-5-5";
  messages: string[] = [];
  constructor(public next: () => Promise<ModelResult>) {}
  complete(msg: string) {
    this.messages.push(msg);
    return this.next();
  }
}

export function okResult(texts: string[], hashtags: string[] = []): () => Promise<ModelResult> {
  return () =>
    Promise.resolve({
      output: { captions: texts.map((text) => ({ text, hashtags })) },
      modelServed: "claude-sonnet-5-5",
      usage: { inputTokens: 200, outputTokens: 400, cacheReadTokens: 1500, cacheWriteTokens: 0 },
      latencyMs: 3200,
    });
}

export function post(body: unknown): Request {
  return new Request("http://localhost/generate-captions", {
    method: "POST",
    headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
