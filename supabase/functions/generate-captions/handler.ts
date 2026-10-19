// Logica di generazione/rifinitura, indipendente dal runtime (testabile con fake).
//
// Flusso:
//  1. Autenticazione (JWT Supabase)
//  2. Validazione input
//  3. Pre-check piano/funzioni (messaggi chiari + upsell)
//  4. reserve_generation: abbonamento attivo, quota, rate limit, budget — atomico
//  5. Chiamata Claude (solo lato server)
//  6. Pulizia output → complete_generation (salva caption + token + costo)
//     oppure fail_generation (rimborso del credito)

import type { CaptionDTO, GenerateResponse, PlanId, RefineAction, Tone } from "../_shared/domain/index.ts";
import {
  canUseRefineAction,
  canUseTone,
  CREDIT_COST,
  enforcedMonthlyCredits,
  minimumPlanForRefineAction,
  minimumPlanForTone,
  parseCaptionRequest,
  PLANS,
} from "../_shared/domain/index.ts";
import type { CaptionModel, ModelResult } from "../_shared/ai.ts";
import { AiCallError } from "../_shared/ai.ts";
import { AppError, corsHeaders, errorResponse, json, log, readJson } from "../_shared/http.ts";
import { minimumAcceptable, sanitizeCaptions } from "../_shared/postprocess.ts";
import { costMicros, EMPTY_USAGE } from "../_shared/pricing.ts";
import { buildGenerateMessage, buildRefineMessage, PROMPT_VERSION } from "../_shared/prompts/index.ts";
import type { CaptionRow, CaptionStore, Reservation } from "../_shared/store.ts";
import { PlanChangedError } from "../_shared/store.ts";

export interface HandlerDeps {
  authenticate(req: Request): Promise<string>;
  store: CaptionStore;
  model: CaptionModel;
  now?: () => Date;
}

export function toCaptionDTO(row: CaptionRow): CaptionDTO {
  return {
    id: row.id,
    text: row.text,
    hashtags: row.hashtags ?? [],
    postType: row.post_type,
    tone: row.tone,
    refineAction: row.refine_action,
    parentCaptionId: row.parent_caption_id,
    createdAt: row.created_at,
  };
}

async function activePlan(store: CaptionStore, userId: string, now: Date): Promise<PlanId> {
  const sub = await store.getSubscription(userId);
  if (!sub || !sub.plan || sub.status === "none") throw new AppError("no_subscription");
  if (sub.status === "expired" || !sub.expiresAt || Date.parse(sub.expiresAt) <= now.getTime()) {
    throw new AppError("subscription_expired", { expiredAt: sub.expiresAt });
  }
  return sub.plan;
}

function assertTone(plan: PlanId, tone: Tone): void {
  if (!canUseTone(plan, tone)) {
    throw new AppError("feature_not_in_plan", { feature: "tone", tone, requiredPlan: minimumPlanForTone(tone) });
  }
}

function assertRefine(plan: PlanId, action: RefineAction): void {
  if (!canUseRefineAction(plan, action)) {
    throw new AppError("feature_not_in_plan", {
      feature: "refine",
      refineAction: action,
      requiredPlan: minimumPlanForRefineAction(action),
    });
  }
}

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: { code: "invalid_request", message: "POST only" } }, 405);

    let reservation: Reservation | undefined;
    try {
      const userId = await deps.authenticate(req);
      const parsed = parseCaptionRequest(await readJson(req));
      if (!parsed.ok) throw new AppError("invalid_request", { reason: parsed.error });
      const request = parsed.value;

      // Il piano può cambiare tra pre-check e prenotazione (webhook): un solo nuovo tentativo.
      for (let attempt = 0;; attempt++) {
        const plan = await activePlan(deps.store, userId, now());
        const rules = PLANS[plan];

        let userMessage: string;
        let count: number;
        let allowHashtags: boolean;
        let target: {
          postType: CaptionRow["post_type"];
          tone: Tone;
          refineAction: RefineAction | null;
          parentId: string | null;
        };

        if (request.action === "generate") {
          assertTone(plan, request.tone);
          count = rules.captionsPerGeneration;
          allowHashtags = rules.smartHashtags && request.includeHashtags === true;
          userMessage = buildGenerateMessage({
            postType: request.postType,
            tone: request.tone,
            count,
            hashtags: allowHashtags,
            ...(request.context ? { context: request.context } : {}),
          });
          target = { postType: request.postType, tone: request.tone, refineAction: null, parentId: null };
        } else {
          assertRefine(plan, request.refineAction);
          const parent = await deps.store.getCaption(userId, request.captionId);
          if (!parent) throw new AppError("not_found");
          assertTone(plan, parent.tone);
          count = 1;
          allowHashtags = rules.smartHashtags && parent.hashtags.length > 0;
          userMessage = buildRefineMessage({
            postType: parent.post_type,
            tone: parent.tone,
            action: request.refineAction,
            originalText: parent.text,
            hashtags: allowHashtags,
          });
          target = {
            postType: parent.post_type,
            tone: parent.tone,
            refineAction: request.refineAction,
            parentId: parent.id,
          };
        }

        try {
          reservation = await deps.store.reserve({
            userId,
            kind: request.action,
            expectedPlan: plan,
            credits: CREDIT_COST[request.action],
            enforcedLimit: enforcedMonthlyCredits(plan),
            visibleLimit: rules.monthlyCredits,
            ratePerMinute: rules.rateLimit.perMinute,
            ratePerHour: rules.rateLimit.perHour,
            periodCostCapMicros: rules.periodCostCapMicros,
            postType: target.postType,
            tone: target.tone,
            refineAction: target.refineAction,
            parentCaptionId: target.parentId,
            model: deps.model.model,
            promptVersion: PROMPT_VERSION,
          });
        } catch (err) {
          if (err instanceof PlanChangedError && attempt === 0) continue;
          if (err instanceof PlanChangedError) throw new AppError("internal");
          throw err;
        }

        let result: ModelResult;
        try {
          result = await deps.model.complete(userMessage);
        } catch (err) {
          const usage = err instanceof AiCallError ? err.usage : EMPTY_USAGE;
          const served = (err instanceof AiCallError && err.modelServed) || deps.model.model;
          const code = err instanceof AppError ? err.code : "internal";
          await deps.store.fail(reservation.generationId, code, usage, costMicros(served, usage));
          reservation = undefined;
          throw err;
        }

        const cost = costMicros(result.modelServed, result.usage);
        const captions = sanitizeCaptions(result.output, { count, allowHashtags });
        if (captions.length < minimumAcceptable(count)) {
          log("warn", "ai_too_few_captions", { got: captions.length, requested: count });
          await deps.store.fail(reservation.generationId, "ai_bad_output", result.usage, cost);
          reservation = undefined;
          throw new AppError("ai_bad_output");
        }

        const rows = await deps.store.complete({
          generationId: reservation.generationId,
          captions,
          modelServed: result.modelServed,
          usage: result.usage,
          costMicros: cost,
          latencyMs: result.latencyMs,
          historyLimit: rules.historyLimit,
        });

        log("info", "generation_succeeded", {
          generationId: reservation.generationId,
          plan,
          kind: request.action,
          model: result.modelServed,
          latencyMs: result.latencyMs,
          inputTokens: result.usage.inputTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          outputTokens: result.usage.outputTokens,
          costMicros: cost,
          promptVersion: PROMPT_VERSION,
        });

        const limit = reservation.creditsLimit;
        const body: GenerateResponse = {
          generationId: reservation.generationId,
          captions: rows.map(toCaptionDTO),
          usage: {
            plan,
            used: reservation.creditsUsed,
            limit,
            remaining: limit === null ? null : Math.max(limit - reservation.creditsUsed, 0),
            periodStart: reservation.periodStart,
            periodEnd: reservation.periodEnd,
          },
        };
        return json(body);
      }
    } catch (err) {
      // Errore dopo la prenotazione ma prima di complete/fail (es. DB): rimborsa.
      if (reservation) await deps.store.fail(reservation.generationId, "internal", EMPTY_USAGE, 0);
      return errorResponse(err);
    }
  };
}
