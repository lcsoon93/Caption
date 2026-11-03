// Gate di navigazione:
//  nessuna sessione → onboarding (prima volta) o login
//  mai abbonato → paywall (nessun piano free)
//  abbonato (anche scaduto) → app; la generazione è bloccata lato server e in UI.
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { signInAsGuest } from "@/lib/auth";
import { env } from "@/lib/env";
import { useSession } from "@/providers/SessionProvider";
import { spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

export default function Index() {
  const { session, status, statusError, loading, onboardingSeen, refreshStatus } = useSession();
  const t = useTheme();
  const [guestError, setGuestError] = useState(false);
  const autoGuest = env.openBeta && !loading && !session && onboardingSeen;

  // Beta aperta: dopo la presentazione si entra subito come ospite, senza email.
  useEffect(() => {
    if (!autoGuest || guestError) return;
    signInAsGuest().catch(() => setGuestError(true));
  }, [autoGuest, guestError]);

  if (autoGuest && guestError) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.lg, backgroundColor: t.background }}>
        <Text style={{ ...typography.title, color: t.text }}>Non riusciamo a farti entrare</Text>
        <Text style={{ ...typography.body, color: t.textMuted }}>Controlla la connessione e riprova tra poco.</Text>
        <Button label="Riprova" onPress={() => setGuestError(false)} />
      </View>
    );
  }
  if (loading || autoGuest) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.background }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (!session) return <Redirect href={onboardingSeen ? "/sign-in" : "/onboarding"} />;
  if (!status && statusError) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.lg, backgroundColor: t.background }}>
        <Text style={{ ...typography.title, color: t.text }}>Non riusciamo a raggiungere Caption</Text>
        <Text style={{ ...typography.body, color: t.textMuted }}>Controlla la connessione e riprova.</Text>
        <Button label="Riprova" onPress={() => void refreshStatus()} />
      </View>
    );
  }
  if (!status || status.status === "none") return <Redirect href={{ pathname: "/paywall", params: { mode: "gate" } }} />;
  return <Redirect href="/create" />;
}
