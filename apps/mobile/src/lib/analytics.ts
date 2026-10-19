// Analytics prodotto (PostHog EU). Regola: mai testo dell'utente o caption negli eventi.

import PostHog from "posthog-react-native";
import { env } from "./env";
import { storage } from "./storage";

export type AnalyticsEvent =
  | "onboarding_completed"
  | "sign_in_completed"
  | "paywall_viewed"
  | "purchase_started"
  | "purchase_completed"
  | "purchase_cancelled"
  | "restore_completed"
  | "generate_requested"
  | "generate_succeeded"
  | "generate_failed"
  | "refine_requested"
  | "caption_copied"
  | "caption_shared"
  | "upgrade_prompt_viewed";

type Props = Record<string, string | number | boolean | null>;

const client = env.posthogKey ? new PostHog(env.posthogKey, { host: env.posthogHost }) : null;

export const analytics = {
  async init(): Promise<void> {
    if (client && (await storage.getAnalyticsOptOut())) await client.optOut();
  },
  identify(userId: string, props: Props = {}): void {
    client?.identify(userId, props);
  },
  track(event: AnalyticsEvent, props: Props = {}): void {
    client?.capture(event, props);
  },
  reset(): void {
    client?.reset();
  },
  async setOptOut(optOut: boolean): Promise<void> {
    await storage.setAnalyticsOptOut(optOut);
    if (!client) return;
    if (optOut) await client.optOut();
    else await client.optIn();
  },
};
