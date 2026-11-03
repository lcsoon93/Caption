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
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/icon.png",
    name: "Caption",
    shortName: "Caption",
    description: "Caption Instagram in italiano, scritte bene, in pochi secondi.",
    lang: "it",
    themeColor: "#0A0A0D",
    backgroundColor: "#0A0A0D",
  },
  plugins: [
    "expo-router",
    "expo-apple-authentication",
    "expo-font",
    [
      "expo-image-picker",
      {
        photosPermission: "Caption usa la foto che scegli solo per scrivere la caption. Non la salviamo.",
        cameraPermission: "Caption usa la foto che scatti solo per scrivere la caption. Non la salviamo.",
        microphonePermission: false,
      },
    ],
    ["expo-splash-screen", { image: "./assets/splash.png", imageWidth: 200, backgroundColor: "#0B0B0F" }],
  ],
  // Hosting in una sottocartella (es. GitHub Pages: /Caption). Vuoto = radice del dominio.
  experiments: { typedRoutes: true, baseUrl: process.env.EXPO_PUBLIC_BASE_URL ?? "" },
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
