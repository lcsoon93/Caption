import { Platform } from "react-native";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variabile d'ambiente mancante: ${name} (vedi apps/mobile/.env.example)`);
  return value;
}

// Expo sostituisce staticamente solo gli accessi diretti `process.env.EXPO_PUBLIC_*`.
export const env = {
  supabaseUrl: required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required("EXPO_PUBLIC_SUPABASE_ANON_KEY", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  revenueCatKey: required(
    "EXPO_PUBLIC_REVENUECAT_*_KEY",
    Platform.OS === "ios" ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  ),
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? null,
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
} as const;
