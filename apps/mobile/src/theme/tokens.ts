// Design tokens: dark-first, contrasto alto, tipografia forte.
export const colors = {
  dark: {
    background: "#0A0A0D",
    surface: "#141419",
    surfaceElevated: "#1C1C24",
    border: "#26262F",
    borderStrong: "#3A3A46",
    text: "#F5F5F7",
    textMuted: "#9A9AA8",
    textFaint: "#62626E",
    accent: "#D4FF5A",
    accentText: "#0A0A0D",
    accentSoft: "rgba(212,255,90,0.12)",
    warning: "#FFB84D",
    danger: "#FF5C7A",
    dangerSoft: "rgba(255,92,122,0.12)",
    overlay: "rgba(0,0,0,0.6)",
  },
  light: {
    background: "#F7F7F3",
    surface: "#FFFFFF",
    surfaceElevated: "#EFEFEA",
    border: "#E4E4DE",
    borderStrong: "#CFCFC7",
    text: "#0A0A0D",
    textMuted: "#5E5E6B",
    textFaint: "#9696A0",
    accent: "#3B5B00",
    accentText: "#FFFFFF",
    accentSoft: "rgba(59,91,0,0.10)",
    warning: "#A35F00",
    danger: "#C8243F",
    dangerSoft: "rgba(200,36,63,0.08)",
    overlay: "rgba(0,0,0,0.35)",
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type Palette = { [K in keyof (typeof colors)["dark"]]: string };

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;

export const typography = {
  hero: { fontSize: 40, lineHeight: 44, fontWeight: "800", letterSpacing: -1.2 },
  display: { fontSize: 32, lineHeight: 38, fontWeight: "800", letterSpacing: -0.8 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.3 },
  caption: { fontSize: 20, lineHeight: 28, fontWeight: "500", letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  small: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  button: { fontSize: 16, lineHeight: 20, fontWeight: "700", letterSpacing: -0.1 },
} as const;
