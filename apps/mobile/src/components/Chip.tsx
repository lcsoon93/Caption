import { Ionicons } from "@expo/vector-icons";
import { Text } from "react-native";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";
import { PressableScale } from "./PressableScale";

interface Props {
  label: string;
  emoji?: string;
  selected?: boolean;
  locked?: boolean;
  compact?: boolean;
  onPress(): void;
}

export function Chip({ label, emoji, selected, locked, compact, onPress }: Props) {
  const t = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      scaleTo={0.94}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={locked ? `${label}, disponibile con un piano superiore` : label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs + 2,
        paddingVertical: compact ? spacing.sm : spacing.sm + 2,
        paddingHorizontal: compact ? spacing.md : spacing.lg - 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        backgroundColor: selected ? t.text : t.surface,
        borderColor: selected ? t.text : t.border,
      }}
    >
      {emoji ? <Text style={{ fontSize: compact ? 13 : 15 }}>{emoji}</Text> : null}
      <Text
        style={{
          ...typography.bodyStrong,
          fontSize: compact ? 13 : 15,
          color: selected ? t.background : locked ? t.textFaint : t.text,
        }}
      >
        {label}
      </Text>
      {locked ? <Ionicons name="lock-closed" size={12} color={t.textFaint} /> : null}
    </PressableScale>
  );
}
