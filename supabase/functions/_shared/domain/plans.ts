// Regole dei piani: unica fonte di verità per quote, toni e funzioni.
// Il database non conosce le quote: l'Edge Function le passa a `reserve_generation`.

import type { RefineAction, Tone } from "./catalog.ts";
import { REFINE_ACTIONS, TONES } from "./catalog.ts";

export const PLAN_IDS = ["base", "standard", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanRules {
  id: PlanId;
  name: string;
  /** Prezzo indicativo per il marketing; il prezzo reale arriva da RevenueCat/store. */
  priceLabel: string;
  /** Crediti mensili. `null` = illimitato (soggetto a `fairUseMonthlyCredits`). */
  monthlyCredits: number | null;
  /** Tetto anti-abuso non mostrato in UI per i piani "illimitati". */
  fairUseMonthlyCredits: number;
  captionsPerGeneration: number;
  allowedTones: readonly Tone[];
  allowedRefineActions: readonly RefineAction[];
  /** Numero massimo di caption conservate nello storico. `null` = storico completo. */
  historyLimit: number | null;
  smartHashtags: boolean;
  rateLimit: { perMinute: number; perHour: number };
  /** Tetto di spesa AI per utente e per periodo di fatturazione (micro-USD). */
  periodCostCapMicros: number;
  features: readonly string[];
}

/** Costo in crediti di ogni operazione (1 credito = 1 caption "consumata" nel contatore). */
export const CREDIT_COST = {
  generate: 1,
  refine: 1,
} as const;

const BASE_TONES: readonly Tone[] = ["diretto", "soft", "minimal", "poetico"];
const STANDARD_REFINE: readonly RefineAction[] = ["more_poetic", "shorter", "more_ironic", "regenerate"];

export const PLANS: Record<PlanId, PlanRules> = {
  base: {
    id: "base",
    name: "Base",
    priceLabel: "0,99 €/mese",
    monthlyCredits: 30,
    fairUseMonthlyCredits: 30,
    captionsPerGeneration: 4,
    allowedTones: BASE_TONES,
    allowedRefineActions: [],
    historyLimit: 40,
    smartHashtags: false,
    rateLimit: { perMinute: 4, perHour: 30 },
    periodCostCapMicros: 400_000, // 0,40 $
    features: ["30 generazioni al mese", "4 toni base", "Storico delle ultime 40 caption"],
  },
  standard: {
    id: "standard",
    name: "Standard",
    priceLabel: "2,99 €/mese",
    monthlyCredits: 150,
    fairUseMonthlyCredits: 150,
    captionsPerGeneration: 5,
    allowedTones: TONES,
    allowedRefineActions: STANDARD_REFINE,
    historyLimit: null,
    smartHashtags: false,
    rateLimit: { perMinute: 6, perHour: 80 },
    periodCostCapMicros: 1_600_000, // 1,60 $
    features: ["150 generazioni al mese", "Tutti i toni", "Storico completo", "Più poetica, più corta, rigenera"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceLabel: "4,99 €/mese",
    monthlyCredits: null,
    fairUseMonthlyCredits: 1000,
    captionsPerGeneration: 6,
    allowedTones: TONES,
    allowedRefineActions: REFINE_ACTIONS,
    historyLimit: null,
    smartHashtags: true,
    rateLimit: { perMinute: 10, perHour: 150 },
    periodCostCapMicros: 3_000_000, // 3,00 $
    features: [
      "Generazioni illimitate",
      "Tutti i toni + priorità",
      "6 versioni per richiesta",
      "Hashtag intelligenti",
      "Più lunga, traduzione in inglese",
    ],
  },
};

export const PLAN_RANK: Record<PlanId, number> = { base: 1, standard: 2, pro: 3 };

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function canUseTone(plan: PlanId, tone: Tone): boolean {
  return PLANS[plan].allowedTones.includes(tone);
}

export function canUseRefineAction(plan: PlanId, action: RefineAction): boolean {
  return PLANS[plan].allowedRefineActions.includes(action);
}

/** Piano minimo che sblocca una funzione: usato dall'app per i messaggi di upsell. */
export function minimumPlanForTone(tone: Tone): PlanId {
  return PLAN_IDS.find((p) => canUseTone(p, tone)) ?? "pro";
}

export function minimumPlanForRefineAction(action: RefineAction): PlanId {
  return PLAN_IDS.find((p) => canUseRefineAction(p, action)) ?? "pro";
}

/** Limite effettivamente applicato lato server (illimitato => fair use). */
export function enforcedMonthlyCredits(plan: PlanId): number {
  return PLANS[plan].monthlyCredits ?? PLANS[plan].fairUseMonthlyCredits;
}
