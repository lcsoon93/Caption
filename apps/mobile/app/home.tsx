// Placeholder della schermata principale: la UI completa (selettori, card, storico)
// è la prossima milestone. Mostra già il contatore utilizzi.
import { PLANS } from "@caption/shared";
import { Pressable, Text, View } from "react-native";
import { useSession } from "@/providers/SessionProvider";
import { spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

export default function Home() {
  const theme = useTheme();
  const { status, signOut } = useSession();
  if (!status?.plan) return null;
  return (
    <View style={{ flex: 1, padding: spacing.xl, paddingTop: 96, gap: spacing.md }}>
      <Text style={{ ...typography.display, color: theme.text }}>Caption</Text>
      <Text style={{ ...typography.body, color: theme.textMuted }}>
        Piano {PLANS[status.plan].name} ·{" "}
        {status.remaining === null ? "illimitate" : `${status.remaining}/${status.limit} rimaste questo mese`}
      </Text>
      <Pressable onPress={signOut}>
        <Text style={{ ...typography.label, color: theme.textMuted }}>Esci</Text>
      </Pressable>
    </View>
  );
}
