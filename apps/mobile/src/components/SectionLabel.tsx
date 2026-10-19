import { Text, View } from "react-native";
import { spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

export function SectionLabel({ children, right }: { children: string; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
      <Text style={{ ...typography.label, color: t.textMuted }}>{children}</Text>
      {right}
    </View>
  );
}
