// Ritorno dal login OAuth sul web (?code=...): scambia il codice PKCE con la sessione.
// Su mobile il ritorno è gestito da WebBrowser.openAuthSessionAsync, qui si torna solo al gate.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { analytics } from "@/lib/analytics";
import { IS_WEB } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

export default function AuthCallback() {
  const t = useTheme();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!IS_WEB || typeof code !== "string") {
      router.replace("/");
      return;
    }
    void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) return setFailed(true);
      analytics.track("sign_in_completed", { method: "google" });
      router.replace("/");
    });
  }, [code]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.lg, backgroundColor: t.background }}>
      {failed
        ? (
          <>
            <Text style={{ ...typography.title, color: t.text, textAlign: "center" }}>Accesso non riuscito</Text>
            <Button label="Riprova" onPress={() => router.replace("/sign-in")} />
          </>
        )
        : <ActivityIndicator color={t.accent} />}
    </View>
  );
}
