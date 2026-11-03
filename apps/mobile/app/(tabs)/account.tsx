import type { SubscriptionStatus } from "@caption/shared";
import { PLANS } from "@caption/shared";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, ScrollView, Switch, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { PressableScale } from "@/components/PressableScale";
import { Screen } from "@/components/Screen";
import { LINKS } from "@/constants/links";
import { analytics } from "@/lib/analytics";
import { api } from "@/lib/api";
import { confirmDestructive, notify } from "@/lib/dialog";
import { env } from "@/lib/env";
import { openManageSubscriptions, PURCHASES_AVAILABLE, restorePurchases } from "@/lib/purchases";
import { storage } from "@/lib/storage";
import { useSession } from "@/providers/SessionProvider";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

function formatDay(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long" }) : "";
}

function statusLine(status: SubscriptionStatus, expiresAt: string | null, willRenew: boolean): string {
  switch (status) {
    case "active":
      return willRenew ? `Si rinnova il ${formatDay(expiresAt)}` : `Attivo fino al ${formatDay(expiresAt)}`;
    case "trial":
      return env.closedBeta ? `Beta tester · fino al ${formatDay(expiresAt)}` : `Prova gratuita fino al ${formatDay(expiresAt)}`;
    case "cancelled":
      return `Disdetto · attivo fino al ${formatDay(expiresAt)}`;
    case "in_grace_period":
      return "Problema con il pagamento: aggiorna il metodo di pagamento";
    case "expired":
      return `Scaduto il ${formatDay(expiresAt)}`;
    case "none":
      return "Nessun abbonamento";
  }
}

function Row({ icon, label, onPress, right, danger }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?(): void;
  right?: React.ReactNode;
  danger?: boolean;
}) {
  const t = useTheme();
  const color = danger ? t.danger : t.text;
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress && !right}
      scaleTo={0.99}
      haptic={onPress ? "light" : "none"}
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg }}
    >
      <Ionicons name={icon} size={20} color={danger ? t.danger : t.textMuted} />
      <Text style={{ ...typography.body, color, flex: 1 }}>{label}</Text>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={t.textFaint} /> : null)}
    </PressableScale>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ ...typography.label, color: t.textMuted, marginLeft: spacing.xs }}>{title}</Text>
      <View style={{ backgroundColor: t.surface, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, overflow: "hidden" }}>
        {children}
      </View>
    </View>
  );
}

export default function Account() {
  const t = useTheme();
  const { session, status, refreshStatus, signOut } = useSession();
  const [optOut, setOptOut] = useState(false);
  const [busy, setBusy] = useState<"restore" | "delete" | null>(null);

  useEffect(() => {
    void storage.getAnalyticsOptOut().then(setOptOut);
  }, []);

  const plan = status?.plan ? PLANS[status.plan] : null;
  const isGuest = session?.user.is_anonymous ?? false;
  const usageRatio = status && status.limit ? Math.min(status.used / status.limit, 1) : 0;

  async function onRestore() {
    setBusy("restore");
    try {
      await restorePurchases();
      await refreshStatus();
      analytics.track("restore_completed");
      notify("Fatto", "Acquisti ripristinati.");
    } catch {
      notify("Ops", "Non siamo riusciti a ripristinare gli acquisti. Riprova.");
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    const confirmed = await confirmDestructive(
      "Eliminare l'account?",
      "Cancelliamo account e storico in modo definitivo. Se hai un abbonamento attivo, disdicilo dalle impostazioni dello store (App Store o Google Play) per non ricevere altri addebiti.",
      "Elimina",
    );
    if (!confirmed) return;
    setBusy("delete");
    try {
      await api.deleteAccount();
      await signOut();
      router.replace("/");
    } catch {
      notify("Ops", "Eliminazione non riuscita. Riprova o scrivici.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.xxl, paddingBottom: spacing.xxxl }}>
        <Text style={{ ...typography.display, color: t.text }}>Account</Text>

        {/* Piano e utilizzo */}
        <View style={{ backgroundColor: t.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, padding: spacing.xl, gap: spacing.lg }}>
          <View style={{ gap: spacing.xs }}>
            <Text style={{ ...typography.label, color: t.accent }}>Il tuo piano</Text>
            <Text style={{ ...typography.title, color: t.text }}>{plan ? `Caption ${plan.name}` : "Nessun piano"}</Text>
            {status
              ? (
                <Text style={{ ...typography.small, color: status.status === "in_grace_period" || status.status === "expired" ? t.warning : t.textMuted }}>
                  {statusLine(status.status, status.expiresAt, status.willRenew)}
                </Text>
              )
              : null}
          </View>

          {status && status.hasAccess
            ? (
              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ ...typography.bodyStrong, color: t.text }}>Generazioni questo mese</Text>
                  <Text style={{ ...typography.bodyStrong, color: t.text, fontVariant: ["tabular-nums"] }}>
                    {status.limit === null ? "Illimitate" : `${status.used} / ${status.limit}`}
                  </Text>
                </View>
                {status.limit !== null
                  ? (
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surfaceElevated, overflow: "hidden" }}>
                      <View
                        style={{
                          width: `${usageRatio * 100}%`,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: usageRatio >= 1 ? t.danger : usageRatio >= 0.85 ? t.warning : t.accent,
                        }}
                      />
                    </View>
                  )
                  : null}
                {status.limit !== null && status.periodEnd
                  ? <Text style={{ ...typography.small, color: t.textFaint }}>Si azzera il {formatDay(status.periodEnd)}</Text>
                  : null}
              </View>
            )
            : null}

          <Button
            label={status?.hasAccess ? (status.plan === "pro" ? "Vedi i piani" : "Passa a un piano superiore") : "Riattiva l'abbonamento"}
            variant={status?.plan === "pro" ? "secondary" : "primary"}
            size="md"
            onPress={() => router.push({ pathname: "/paywall", params: { mode: status?.hasAccess ? "upgrade" : "expired" } })}
          />
        </View>

        {PURCHASES_AVAILABLE
          ? (
            <Group title="Abbonamento">
              <Row icon="card-outline" label="Gestisci abbonamento" onPress={() => void openManageSubscriptions()} />
              <Row
                icon="refresh-outline"
                label={busy === "restore" ? "Ripristino…" : "Ripristina acquisti"}
                onPress={() => void onRestore()}
              />
            </Group>
          )
          : null}

        <Group title="Privacy">
          <Row
            icon="analytics-outline"
            label="Statistiche d'uso anonime"
            right={
              <Switch
                value={!optOut}
                onValueChange={(enabled) => {
                  setOptOut(!enabled);
                  void analytics.setOptOut(!enabled);
                }}
                trackColor={{ true: t.accent, false: t.borderStrong }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <Row icon="shield-checkmark-outline" label="Informativa privacy" onPress={() => void Linking.openURL(LINKS.privacy)} />
          <Row icon="document-text-outline" label="Termini di servizio" onPress={() => void Linking.openURL(LINKS.terms)} />
          <Row icon="chatbubble-ellipses-outline" label="Supporto" onPress={() => void Linking.openURL(LINKS.support)} />
        </Group>

        <Group title={isGuest ? "Ospite · beta" : session?.user.email ?? "Account"}>
          {isGuest
            ? null // un ospite che esce perde storico e accesso: niente "Esci"
            : <Row icon="log-out-outline" label="Esci" onPress={() => void signOut().then(() => router.replace("/"))} />}
          <Row
            icon="trash-outline"
            label={busy === "delete" ? "Eliminazione…" : "Elimina account"}
            danger
            onPress={() => void onDelete()}
          />
        </Group>

        <Text style={{ ...typography.small, color: t.textFaint, textAlign: "center" }}>
          Caption {Constants.expoConfig?.version ?? ""}
        </Text>
      </ScrollView>
    </Screen>
  );
}
