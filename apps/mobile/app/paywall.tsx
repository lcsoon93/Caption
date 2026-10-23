// Paywall: nessun piano free, quindi in modalità "gate" non si può chiudere.
// Prezzi letti dallo store via RevenueCat (obbligatorio mostrare il prezzo localizzato).

import type { PlanId } from "@caption/shared";
import { isPlanId, PLAN_IDS, PLAN_RANK, PLANS } from "@caption/shared";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { PressableScale } from "@/components/PressableScale";
import { LINKS } from "@/constants/links";
import { analytics } from "@/lib/analytics";
import { notify } from "@/lib/dialog";
import { getPlanPackages, type PlanPackage, PURCHASES_AVAILABLE, purchasePlan, restorePurchases } from "@/lib/purchases";
import { useSession } from "@/providers/SessionProvider";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

type Mode = "gate" | "upgrade" | "expired";

const HEADLINES: Record<Mode, { title: string; subtitle: string }> = {
  gate: {
    title: "Caption che sembrano scritte da te.\nMa meglio.",
    subtitle: "Scegli un piano per iniziare. Disdici quando vuoi.",
  },
  expired: {
    title: "Bentornato.\nRiprendiamo a scrivere?",
    subtitle: "Il tuo abbonamento è scaduto. Lo storico ti aspetta.",
  },
  upgrade: {
    title: "Più toni, più versioni,\nzero limiti.",
    subtitle: "Cambia piano in qualsiasi momento.",
  },
};

export default function Paywall() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ plan?: string; mode?: string }>();
  const mode: Mode = params.mode === "upgrade" || params.mode === "expired" ? params.mode : "gate";
  const { status, refreshStatus, signOut } = useSession();

  const currentPlan = status?.hasAccess ? status.plan : null;
  const defaultPlan: PlanId = isPlanId(params.plan) ? params.plan : currentPlan === "standard" ? "pro" : "standard";

  const [packages, setPackages] = useState<PlanPackage[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<PlanId>(defaultPlan);
  const [busy, setBusy] = useState<"purchase" | "restore" | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setPackages(await getPlanPackages());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    analytics.track("paywall_viewed", { mode, currentPlan: currentPlan ?? "none" });
    void load();
  }, [load, mode, currentPlan]);

  async function finish() {
    await refreshStatus();
    if (mode !== "gate" && router.canGoBack()) router.back();
    else router.replace("/create");
  }

  async function onPurchase() {
    const target = packages?.find((p) => p.plan === selected);
    if (!target) return;
    setBusy("purchase");
    analytics.track("purchase_started", { plan: selected });
    try {
      const { cancelled } = await purchasePlan(target, status?.productId ?? null);
      if (cancelled) {
        analytics.track("purchase_cancelled", { plan: selected });
        return;
      }
      analytics.track("purchase_completed", { plan: selected });
      await finish();
    } catch {
      notify("Acquisto non riuscito", "Non ti è stato addebitato nulla. Riprova tra poco.");
    } finally {
      setBusy(null);
    }
  }

  async function onRestore() {
    setBusy("restore");
    try {
      await restorePurchases();
      await refreshStatus();
      analytics.track("restore_completed");
      await finish();
    } catch {
      notify("Nessun acquisto trovato", "Non abbiamo trovato abbonamenti attivi da ripristinare.");
    } finally {
      setBusy(null);
    }
  }

  const headline = HEADLINES[mode];
  // Sul web i piani si mostrano con il prezzo di listino, ma l'acquisto avviene dall'app mobile.
  const offers: Array<{ plan: PlanId; priceString: string }> | null = PURCHASES_AVAILABLE
    ? packages
    : PLAN_IDS.map((plan) => ({ plan, priceString: PLANS[plan].priceLabel.replace("/mese", "") }));
  const selectedPkg = PURCHASES_AVAILABLE ? packages?.find((p) => p.plan === selected) : undefined;
  const selectedOffer = offers?.find((p) => p.plan === selected);
  const isCurrent = selected === currentPlan;
  const closable = mode !== "gate";

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ gestureEnabled: closable }} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xxl, paddingBottom: 220, gap: spacing.xl }}>
        {closable
          ? (
            <PressableScale
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/create"))}
              accessibilityLabel="Chiudi"
              style={{ position: "absolute", right: spacing.xl, top: insets.top + spacing.md, padding: spacing.sm, zIndex: 1 }}
            >
              <Ionicons name="close" size={24} color={t.textMuted} />
            </PressableScale>
          )
          : null}

        <View style={{ gap: spacing.md }}>
          <Text style={{ ...typography.label, color: t.accent }}>caption.</Text>
          <Text style={{ ...typography.display, color: t.text }}>{headline.title}</Text>
          <Text style={{ ...typography.body, color: t.textMuted }}>{headline.subtitle}</Text>
        </View>

        {loadError
          ? <Banner tone="danger" title="Non riusciamo a caricare i piani" actionLabel="Riprova" onAction={() => void load()} />
          : null}
        {!PURCHASES_AVAILABLE
          ? (
            <Banner
              tone="info"
              title="Abbonamenti dal web in arrivo"
              message="Per ora l'abbonamento si attiva dall'app iOS o Android e vale anche qui sul web, con lo stesso account."
            />
          )
          : null}
        {PURCHASES_AVAILABLE && !packages && !loadError ? <ActivityIndicator color={t.accent} style={{ marginVertical: spacing.xxl }} /> : null}
        {PURCHASES_AVAILABLE && packages && packages.length === 0
          ? <Banner tone="warning" title="Piani non disponibili" message="Riprova più tardi o controlla il tuo account dello store." />
          : null}

        {offers?.length
          ? PLAN_IDS.map((id, i) => {
            const pkg = offers.find((p) => p.plan === id);
            if (!pkg) return null;
            const rules = PLANS[id];
            const active = selected === id;
            const current = id === currentPlan;
            return (
              <Animated.View key={id} entering={FadeInDown.delay(i * 70).springify().damping(18)}>
                <PressableScale
                  haptic="selection"
                  scaleTo={0.98}
                  onPress={() => setSelected(id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${rules.name}, ${pkg.priceString} al mese`}
                  style={{
                    backgroundColor: active ? t.surfaceElevated : t.surface,
                    borderRadius: radius.lg,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? t.accent : t.border,
                    padding: spacing.xl,
                    gap: spacing.md,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                      <Text style={{ ...typography.title, color: t.text }}>{rules.name}</Text>
                      {id === "standard" && !current
                        ? (
                          <View style={{ backgroundColor: t.accent, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                            <Text style={{ ...typography.label, fontSize: 10, color: t.accentText }}>Più scelto</Text>
                          </View>
                        )
                        : null}
                      {current
                        ? (
                          <View style={{ borderColor: t.borderStrong, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                            <Text style={{ ...typography.label, fontSize: 10, color: t.textMuted }}>Attuale</Text>
                          </View>
                        )
                        : null}
                    </View>
                    <Text style={{ ...typography.bodyStrong, color: t.text }}>
                      {pkg.priceString}
                      <Text style={{ color: t.textFaint, fontWeight: "400" }}>/mese</Text>
                    </Text>
                  </View>
                  {rules.features.map((f) => (
                    <View key={f} style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                      <Ionicons name="checkmark" size={16} color={active ? t.accent : t.textMuted} />
                      <Text style={{ ...typography.body, color: active ? t.text : t.textMuted }}>{f}</Text>
                    </View>
                  ))}
                </PressableScale>
              </Animated.View>
            );
          })
          : null}
      </ScrollView>

      {/* CTA fissa */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: t.background,
          borderTopWidth: 1,
          borderTopColor: t.border,
          padding: spacing.xl,
          paddingBottom: insets.bottom + spacing.lg,
          gap: spacing.md,
        }}
      >
        <Button
          label={isCurrent
            ? "È già il tuo piano"
            : !PURCHASES_AVAILABLE
            ? `${PLANS[selected].name} · ${selectedOffer?.priceString ?? ""}/mese · dall'app`
            : selectedPkg
            ? `${currentPlan && PLAN_RANK[selected] < PLAN_RANK[currentPlan] ? "Passa a" : "Abbonati a"} ${PLANS[selected].name} · ${selectedPkg.priceString}/mese`
            : "Continua"}
          disabled={!selectedPkg || isCurrent}
          loading={busy === "purchase"}
          onPress={() => void onPurchase()}
        />
        <Text style={{ ...typography.small, fontSize: 11, lineHeight: 15, color: t.textFaint, textAlign: "center" }}>
          Abbonamento mensile con rinnovo automatico, addebitato sul tuo account dello store. Puoi disdire in qualsiasi
          momento dalle impostazioni dello store, almeno 24 ore prima del rinnovo.
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: spacing.lg }}>
          {PURCHASES_AVAILABLE
            ? (
              <PressableScale onPress={() => void onRestore()} disabled={busy !== null}>
                <Text style={{ ...typography.small, fontWeight: "600", color: t.textMuted }}>
                  {busy === "restore" ? "Ripristino…" : "Ripristina"}
                </Text>
              </PressableScale>
            )
            : null}
          <PressableScale onPress={() => void Linking.openURL(LINKS.terms)}>
            <Text style={{ ...typography.small, color: t.textMuted }}>Termini</Text>
          </PressableScale>
          <PressableScale onPress={() => void Linking.openURL(LINKS.privacy)}>
            <Text style={{ ...typography.small, color: t.textMuted }}>Privacy</Text>
          </PressableScale>
          {mode === "gate"
            ? (
              <PressableScale onPress={() => void signOut().then(() => router.replace("/"))}>
                <Text style={{ ...typography.small, color: t.textMuted }}>Esci</Text>
              </PressableScale>
            )
            : null}
        </View>
      </View>
    </View>
  );
}
