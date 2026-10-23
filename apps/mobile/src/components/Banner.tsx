import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";
import { PressableScale } from "./PressableScale";

interface Props {
  tone: "info" | "warning" | "danger";
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?(): void;
}

export function Banner({ tone, title, message, actionLabel, onAction }: Props) {
  const t = useTheme();
  const color = tone === "danger" ? t.danger : tone === "warning" ? t.warning : t.accent;
  const icon = tone === "info" ? "sparkles" : "alert-circle";
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(160)}
      accessibilityRole="alert"
      style={{
        flexDirection: "row",
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.md,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderLeftWidth: 3,
        borderLeftColor: color,
      }}
    >
      <Ionicons name={icon} size={20} color={color} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={{ ...typography.bodyStrong, color: t.text }}>{title}</Text>
        {message ? <Text style={{ ...typography.small, color: t.textMuted }}>{message}</Text> : null}
        {actionLabel && onAction
          ? (
            <PressableScale onPress={onAction} style={{ alignSelf: "flex-start", marginTop: spacing.xs }}>
              <Text style={{ ...typography.bodyStrong, color }}>{actionLabel} →</Text>
            </PressableScale>
          )
          : null}
      </View>
    </Animated.View>
  );
}
