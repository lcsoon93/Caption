import { Platform } from "react-native";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variabile d'ambiente mancante: ${name} (vedi apps/mobile/.env.example)`);
  return value;
}

// Expo sostituisce staticamente solo gli accessi diretti `process.env.EXPO_PUBLIC_*`.
export const env = {
  supabaseUrl: required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required("EXPO_PUBLIC_SUPABASE_ANON_KEY", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  /** Chiave RevenueCat della piattaforma. Sul web gli acquisti non sono ancora attivi (null). */
  revenueCatKey: Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
    default: undefined,
  }) ?? null,
  /** Mostra "Continua con Google" solo quando il provider è configurato su Supabase. */
  googleAuthEnabled: process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED === "true",
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? null,
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
} as const;

export const IS_WEB = Platform.OS === "web";
