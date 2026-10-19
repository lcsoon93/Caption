import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "@/lib/supabase";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

// Login senza password: codice OTP via email. Sign in with Apple / Google arrivano in Fase 1b.
export default function SignIn() {
  const theme = useTheme();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const { error: err } = step === "email"
      ? await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } })
      : await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (err) return setError(step === "email" ? "Email non valida o troppi tentativi." : "Codice non valido.");
    if (step === "email") setStep("code");
    else router.replace("/");
  }

  const input = {
    ...typography.body,
    color: theme.text,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  } as const;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.lg }}
    >
      <Text style={{ ...typography.display, color: theme.text }}>Caption</Text>
      <Text style={{ ...typography.body, color: theme.textMuted }}>
        {step === "email" ? "Accedi con la tua email: ti mandiamo un codice." : `Inserisci il codice inviato a ${email}`}
      </Text>
      {step === "email"
        ? (
          <TextInput
            style={input}
            value={email}
            onChangeText={setEmail}
            placeholder="nome@email.it"
            placeholderTextColor={theme.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        )
        : (
          <TextInput
            style={input}
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
          />
        )}
      {error ? <Text style={{ ...typography.body, color: theme.danger }}>{error}</Text> : null}
      <Pressable
        onPress={submit}
        disabled={busy}
        style={({ pressed }) => ({
          backgroundColor: theme.accent,
          borderRadius: radius.pill,
          padding: spacing.lg,
          alignItems: "center",
          opacity: pressed || busy ? 0.8 : 1,
        })}
      >
        {busy
          ? <ActivityIndicator color={theme.accentText} />
          : <Text style={{ ...typography.label, color: theme.accentText }}>{step === "email" ? "CONTINUA" : "ACCEDI"}</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}
