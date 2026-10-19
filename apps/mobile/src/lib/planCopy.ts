import type { PlanId, RefineAction, Tone } from "@caption/shared";
import { minimumPlanForRefineAction, minimumPlanForTone, PLANS, REFINE_ACTION_META, TONE_META } from "@caption/shared";
import type { UpgradeRequest } from "@/providers/UpgradeProvider";

export function nextPlan(plan: PlanId | null): PlanId {
  return plan === "base" ? "standard" : "pro";
}

export const upgradeCopy = {
  tone(tone: Tone): UpgradeRequest {
    const plan = minimumPlanForTone(tone);
    return {
      reason: "tone",
      requiredPlan: plan,
      title: `Il tono ${TONE_META[tone].label} è incluso in ${PLANS[plan].name}`,
      message: "Sblocca tutti e 7 i toni per trovare sempre la voce giusta per il tuo post.",
    };
  },
  refine(action: RefineAction): UpgradeRequest {
    const plan = minimumPlanForRefineAction(action);
    return {
      reason: "refine",
      requiredPlan: plan,
      title: `“${REFINE_ACTION_META[action].label}” è incluso in ${PLANS[plan].name}`,
      message: "Rifinisci ogni caption con un tocco: più corta, più poetica, più ironica.",
    };
  },
  hashtags(): UpgradeRequest {
    return {
      reason: "hashtags",
      requiredPlan: "pro",
      title: "Hashtag intelligenti con Pro",
      message: "Hashtag pertinenti al tuo post, un mix di nicchia e popolari, pronti da incollare.",
    };
  },
  quota(plan: PlanId | null): UpgradeRequest {
    const target = nextPlan(plan);
    return {
      reason: "quota",
      requiredPlan: target,
      title: "Hai finito le generazioni del mese",
      message: target === "pro"
        ? "Con Pro generi senza limiti, con 6 versioni per richiesta."
        : `Con ${PLANS[target].name} hai ${PLANS[target].monthlyCredits} generazioni al mese e tutti i toni.`,
    };
  },
};
