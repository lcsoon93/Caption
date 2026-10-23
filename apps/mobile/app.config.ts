import type { ConfigContext, ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? "Caption (Dev)" : "Caption",
  slug: "caption",
  scheme: "caption",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: IS_DEV ? "app.caption.dev" : "app.caption",
    supportsTablet: false,
    usesAppleSignIn: true,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: IS_DEV ? "app.caption.dev" : "app.caption",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#0B0B0F" },
  },
  plugins: [
    "expo-router",
    "expo-apple-authentication",
    "expo-font",
    ["expo-splash-screen", { image: "./assets/splash.png", imageWidth: 200, backgroundColor: "#0B0B0F" }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
