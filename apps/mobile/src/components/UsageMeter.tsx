import { Text, View } from "react-native";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";
import { PressableScale } from "./PressableScale";

interface Props {
  remaining: number | null;
  limit: number | null;
  onPress?(): void;
}

/** Contatore utilizzi: "128 / 150" con barra, "∞" per Pro. */
export function UsageMeter({ remaining, limit, onPress }: Props) {
  const t = useTheme();
  const unlimited = limit === null || remaining === null;
  const ratio = unlimited ? 1 : Math.max(0, Math.min(1, remaining / limit));
  const color = unlimited ? t.accent : remaining === 0 ? t.danger : ratio <= 0.15 ? t.warning : t.accent;

  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      accessibilityLabel={unlimited ? "Generazioni illimitate" : `${remaining} generazioni rimaste su ${limit}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        paddingVertical: spacing.xs + 2,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
      }}
    >
      <View style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: t.border, overflow: "hidden" }}>
        <View style={{ width: `${ratio * 100}%`, height: 4, backgroundColor: color }} />
      </View>
      <Text style={{ ...typography.small, fontWeight: "700", color: t.text, fontVariant: ["tabular-nums"] }}>
        {unlimited ? "∞" : `${remaining}`}
        {unlimited ? null : <Text style={{ color: t.textFaint, fontWeight: "500" }}>/{limit}</Text>}
      </Text>
    </PressableScale>
  );
}
