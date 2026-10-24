import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/Button";
import { PressableScale } from "@/components/PressableScale";
import { Screen } from "@/components/Screen";
import { analytics } from "@/lib/analytics";
import { env } from "@/lib/env";
import {
  AuthCancelled,
  isAppleSignInAvailable,
  isValidEmail,
  sendEmailCode,
  signInWithApple,
  signInWithGoogle,
  verifyEmailCode,
} from "@/lib/auth";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

type Busy = "apple" | "google" | "email" | null;

export default function SignIn() {
  const t = useTheme();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"choose" | "code">("choose");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  async function run(kind: Exclude<Busy, null>, action: () => Promise<void>, errorMessage: string) {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (!(err instanceof AuthCancelled)) setError(errorMessage);
    } finally {
      setBusy(null);
    }
  }

  function done(method: string) {
    analytics.track("sign_in_completed", { method });
    router.replace("/");
  }

  const input = {
    ...typography.body,
    fontSize: 17,
    color: t.text,
    backgroundColor: t.surface,
    borderColor: t.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  } as const;

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, padding: spacing.xl, justifyContent: "flex-end", gap: spacing.xl }}>
        <Animated.View entering={FadeInDown.springify()} style={{ flex: 1, justifyContent: "center", gap: spacing.md }}>
          <Text style={{ ...typography.label, color: t.accent }}>caption.</Text>
          <Text style={{ ...typography.hero, color: t.text }}>
            {step === "choose" ? "Iniziamo." : "Controlla\nla tua email."}
          </Text>
          <Text style={{ ...typography.body, color: t.textMuted, fontSize: 17, lineHeight: 24 }}>
            {step === "choose"
              ? "Crea il tuo account in un attimo: serve per salvare storico e abbonamento."
              : `Abbiamo scritto a ${email.trim()}. Tocca il link nell'email da questo dispositivo, oppure inserisci qui il codice se l'email ne contiene uno.`}
          </Text>
        </Animated.View>

        {step === "choose"
          ? (
            <Animated.View entering={FadeIn} style={{ gap: spacing.md }}>
              {appleAvailable
                ? (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                    cornerRadius={radius.pill}
                    style={{ height: 56 }}
                    onPress={() => void run("apple", async () => {
                      await signInWithApple();
                      done("apple");
                    }, "Accesso con Apple non riuscito.")}
                  />
                )
                : null}
              {env.googleAuthEnabled
                ? (
              <Button
                label="Continua con Google"
                icon="logo-google"
                variant="secondary"
                loading={busy === "google"}
                disabled={busy !== null}
                onPress={() => void run("google", async () => {
                  await signInWithGoogle();
                  done("google");
                }, "Accesso con Google non riuscito.")}
              />
                )
                : null}
              {appleAvailable || env.googleAuthEnabled
                ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.xs }}>
                <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
                <Text style={{ ...typography.small, color: t.textFaint }}>oppure</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
              </View>
                )
                : null}
              <TextInput
                style={input}
                value={email}
                onChangeText={setEmail}
                placeholder="nome@email.it"
                placeholderTextColor={t.textFaint}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="send"
                accessibilityLabel="Email"
              />
              <Button
                label="Continua con email"
                variant="primary"
                loading={busy === "email"}
                disabled={busy !== null || !isValidEmail(email)}
                onPress={() => void run("email", async () => {
                  await sendEmailCode(email.trim());
                  setStep("code");
                }, "Non siamo riusciti a inviare il codice. Riprova tra poco.")}
              />
            </Animated.View>
          )
          : (
            <Animated.View entering={FadeIn} style={{ gap: spacing.md }}>
              <TextInput
                style={{ ...input, fontSize: 28, letterSpacing: 10, textAlign: "center", fontVariant: ["tabular-nums"] }}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                placeholderTextColor={t.textFaint}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                autoFocus
                accessibilityLabel="Codice di verifica"
              />
              <Button
                label="Accedi"
                loading={busy === "email"}
                disabled={busy !== null || code.length !== 6}
                onPress={() => void run("email", async () => {
                  await verifyEmailCode(email.trim(), code);
                  done("email");
                }, "Codice non valido o scaduto.")}
              />
              <PressableScale onPress={() => { setStep("choose"); setCode(""); setError(null); }} style={{ alignItems: "center", padding: spacing.sm }}>
                <Text style={{ ...typography.small, fontWeight: "600", color: t.textMuted }}>Usa un'altra email</Text>
              </PressableScale>
            </Animated.View>
          )}

        {error ? <Text accessibilityRole="alert" style={{ ...typography.small, color: t.danger, textAlign: "center" }}>{error}</Text> : null}
        <Text style={{ ...typography.small, fontSize: 11, color: t.textFaint, textAlign: "center" }}>
          Continuando accetti Termini di servizio e Informativa privacy.
        </Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}
