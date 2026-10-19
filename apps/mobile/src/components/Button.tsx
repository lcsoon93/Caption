import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Text, View } from "react-native";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";
import { type HapticStyle, PressableScale } from "./PressableScale";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props {
  label: string;
  onPress(): void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  haptic?: HapticStyle;
  size?: "md" | "lg";
  accessibilityHint?: string;
}

export function Button({ label, onPress, variant = "primary", loading, disabled, icon, haptic = "medium", size = "lg", accessibilityHint }: Props) {
  const t = useTheme();
  const palette = {
    primary: { bg: t.accent, fg: t.accentText, border: t.accent },
    secondary: { bg: t.surfaceElevated, fg: t.text, border: t.border },
    ghost: { bg: "transparent", fg: t.textMuted, border: "transparent" },
    danger: { bg: t.dangerSoft, fg: t.danger, border: "transparent" },
  }[variant];

  return (
    <PressableScale
      onPress={() => {
        if (!loading) onPress();
      }}
      disabled={disabled}
      haptic={loading ? "none" : haptic}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={{
        backgroundColor: palette.bg,
        borderColor: palette.border,
        borderWidth: 1,
        borderRadius: radius.pill,
        paddingVertical: size === "lg" ? spacing.lg + 2 : spacing.md,
        paddingHorizontal: spacing.xl,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {loading
        ? <ActivityIndicator color={palette.fg} />
        : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            {icon ? <Ionicons name={icon} size={18} color={palette.fg} /> : null}
            <Text style={{ ...typography.button, color: palette.fg }}>{label}</Text>
          </View>
        )}
    </PressableScale>
  );
}
