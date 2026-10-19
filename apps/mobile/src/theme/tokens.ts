// Design tokens: dark-first, contrasto alto, tipografia forte.
export const colors = {
  dark: {
    background: "#0B0B0F",
    surface: "#15151C",
    surfaceElevated: "#1E1E28",
    border: "#2A2A36",
    text: "#F5F5F7",
    textMuted: "#A1A1B0",
    accent: "#C8FF4D",
    accentText: "#0B0B0F",
    danger: "#FF5C7A",
  },
  light: {
    background: "#FAFAF7",
    surface: "#FFFFFF",
    surfaceElevated: "#F2F2EE",
    border: "#E4E4DE",
    text: "#0B0B0F",
    textMuted: "#5E5E6B",
    accent: "#3A5A00",
    accentText: "#FFFFFF",
    danger: "#C8243F",
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type Palette = { [K in keyof (typeof colors)["dark"]]: string };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.8 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.3 },
  caption: { fontSize: 19, lineHeight: 27, fontWeight: "500", letterSpacing: -0.1 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  label: { fontSize: 13, lineHeight: 16, fontWeight: "600", letterSpacing: 0.4 },
} as const;
