// Ritorno dal login via link (email "magic link" o Google sul web): ?code=... → sessione.
// Il codice PKCE si può scambiare solo sullo stesso dispositivo/browser che ha richiesto
// l'accesso (il "verifier" è salvato lì).
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { analytics } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";
import { spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

export default function AuthCallback() {
  const t = useTheme();
  const { code, error_description: errorDescription } = useLocalSearchParams<{
    code?: string;
    error_description?: string;
  }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) return router.replace("/"); // già scambiato (es. OAuth su mobile)
      if (typeof code !== "string" || errorDescription) {
        if (!cancelled) setFailed(true);
        return;
      }
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;
      if (error) return setFailed(true);
      analytics.track("sign_in_completed", { method: "link" });
      router.replace("/");
    })();
    return () => {
      cancelled = true;
    };
  }, [code, errorDescription]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.lg, backgroundColor: t.background }}>
      {failed
        ? (
          <>
            <Text style={{ ...typography.title, color: t.text, textAlign: "center" }}>Link non valido o scaduto</Text>
            <Text style={{ ...typography.body, color: t.textMuted, textAlign: "center" }}>
              Apri il link sullo stesso dispositivo e browser in cui hai chiesto l'accesso, oppure richiedine uno nuovo.
            </Text>
            <Button label="Richiedi un nuovo link" onPress={() => router.replace("/sign-in")} />
          </>
        )
        : <ActivityIndicator color={t.accent} />}
    </View>
  );
}
