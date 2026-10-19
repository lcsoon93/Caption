import { PLANS, PLAN_IDS } from "@caption/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { presentPaywall, restore } from "@/lib/purchases";
import { useSession } from "@/providers/SessionProvider";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

// Nessun piano free: questa schermata blocca l'accesso finché non c'è un abbonamento attivo.
export default function Paywall() {
  const theme = useTheme();
  const { status, refreshStatus, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const expired = status?.status === "expired";

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await refreshStatus();
      router.replace("/");
    } catch {
      Alert.alert("Ops", "Operazione non riuscita. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: 96, gap: spacing.lg }}>
      <Text style={{ ...typography.display, color: theme.text }}>
        {expired ? "Il tuo abbonamento è scaduto" : "Caption che sembrano scritte da te. Ma meglio."}
      </Text>
      {PLAN_IDS.map((id) => (
        <View
          key={id}
          style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm }}
        >
          <Text style={{ ...typography.title, color: theme.text }}>
            {PLANS[id].name} · {PLANS[id].priceLabel}
          </Text>
          {PLANS[id].features.map((f) => (
            <Text key={f} style={{ ...typography.body, color: theme.textMuted }}>✓ {f}</Text>
          ))}
        </View>
      ))}
      <Pressable
        disabled={busy}
        onPress={() => run(presentPaywall)}
        style={{ backgroundColor: theme.accent, borderRadius: radius.pill, padding: spacing.lg, alignItems: "center" }}
      >
        <Text style={{ ...typography.label, color: theme.accentText }}>SCEGLI IL TUO PIANO</Text>
      </Pressable>
      <Pressable disabled={busy} onPress={() => run(restore)} style={{ alignItems: "center", padding: spacing.md }}>
        <Text style={{ ...typography.label, color: theme.textMuted }}>Ripristina acquisti</Text>
      </Pressable>
      <Pressable onPress={signOut} style={{ alignItems: "center" }}>
        <Text style={{ ...typography.label, color: theme.textMuted }}>Esci</Text>
      </Pressable>
    </ScrollView>
  );
}
