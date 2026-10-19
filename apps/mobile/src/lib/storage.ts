// Preferenze locali non sensibili.
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  onboardingSeen: "caption.onboarding_seen.v1",
  analyticsOptOut: "caption.analytics_opt_out",
  lastSelection: "caption.last_selection.v1",
} as const;

async function getBool(key: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key)) === "1";
  } catch {
    return false;
  }
}

async function setBool(key: string, value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value ? "1" : "0");
  } catch {
    // preferenza non critica
  }
}

export const storage = {
  getOnboardingSeen: () => getBool(KEYS.onboardingSeen),
  setOnboardingSeen: () => setBool(KEYS.onboardingSeen, true),
  getAnalyticsOptOut: () => getBool(KEYS.analyticsOptOut),
  setAnalyticsOptOut: (v: boolean) => setBool(KEYS.analyticsOptOut, v),
  async getLastSelection(): Promise<{ postType?: string; tone?: string }> {
    try {
      return JSON.parse((await AsyncStorage.getItem(KEYS.lastSelection)) ?? "{}") as { postType?: string; tone?: string };
    } catch {
      return {};
    }
  },
  async setLastSelection(value: { postType: string; tone: string }): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.lastSelection, JSON.stringify(value));
    } catch {
      // non critico
    }
  },
};
