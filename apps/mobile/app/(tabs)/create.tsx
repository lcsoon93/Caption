import type { PlanId, RefineAction } from "@caption/shared";
import { canUseTone, CONTEXT_MAX_LENGTH, PLANS, POST_TYPE_META, POST_TYPES, TONE_META, TONES } from "@caption/shared";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, type ScrollViewInstance, Switch, Text, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { CaptionCard } from "@/components/CaptionCard";
import { Chip } from "@/components/Chip";
import { Screen } from "@/components/Screen";
import { SectionLabel } from "@/components/SectionLabel";
import { SkeletonCard } from "@/components/SkeletonCard";
import { UsageMeter } from "@/components/UsageMeter";
import { useCaptionGenerator } from "@/hooks/useCaptionGenerator";
import type { CaptionApiError } from "@/lib/api";
import { openManageSubscriptions } from "@/lib/purchases";
import { upgradeCopy } from "@/lib/planCopy";
import { useSession } from "@/providers/SessionProvider";
import { useUpgrade } from "@/providers/UpgradeProvider";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

const BOTTOM_BAR_HEIGHT = 96;

export default function Create() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { status } = useSession();
  const showUpgrade = useUpgrade();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [resultsY, setResultsY] = useState(0);

  const plan: PlanId | null = status?.plan ?? null;
  const hasAccess = status?.hasAccess ?? false;
  const outOfCredits = status?.remaining === 0;

  function handleError(error: CaptionApiError, ctx: { refineAction?: RefineAction }) {
    switch (error.code) {
      case "no_subscription":
      case "subscription_expired":
        router.push({ pathname: "/paywall", params: { mode: "expired" } });
        return;
      case "quota_exceeded":
        showUpgrade(upgradeCopy.quota(plan));
        return;
      case "feature_not_in_plan":
        showUpgrade(ctx.refineAction ? upgradeCopy.refine(ctx.refineAction) : upgradeCopy.tone(gen.tone));
        return;
      default:
        // mostrato come banner sopra il pulsante
        return;
    }
  }

  const gen = useCaptionGenerator({ onError: handleError });

  async function onGenerate() {
    if (!hasAccess) return router.push({ pathname: "/paywall", params: { mode: "expired" } });
    if (outOfCredits) return showUpgrade(upgradeCopy.quota(plan));
    await gen.generate();
    // porta l'attenzione sui risultati appena arrivano
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(resultsY - spacing.lg, 0), animated: true }));
  }

  const ctaLabel = !hasAccess
    ? "Rinnova per generare"
    : outOfCredits
    ? "Generazioni finite · Passa a un piano superiore"
    : gen.captions.length
    ? "Genera di nuovo"
    : "Genera caption";

  const bannerError = gen.error && !gen.error.needsPaywall ? gen.error : null;
  const skeletonCount = plan ? PLANS[plan].captionsPerGeneration : 4;

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: BOTTOM_BAR_HEIGHT + spacing.xxl, gap: spacing.xxl }}
        >
          {/* Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ ...typography.title, color: t.text, letterSpacing: -0.6 }}>caption.</Text>
            {status?.plan && hasAccess
              ? <UsageMeter remaining={status.remaining} limit={status.limit} onPress={() => router.push("/account")} />
              : null}
          </View>

          <Text style={{ ...typography.hero, color: t.text }}>
            Scrivi meno.{"\n"}
            <Text style={{ color: t.textFaint }}>Posta meglio.</Text>
          </Text>

          {status?.status === "expired"
            ? (
              <Banner
                tone="danger"
                title="Il tuo abbonamento è scaduto"
                message="Lo storico resta tuo. Rinnova per tornare a generare caption."
                actionLabel="Rinnova"
                onAction={() => router.push({ pathname: "/paywall", params: { mode: "expired" } })}
              />
            )
            : null}
          {status?.status === "in_grace_period"
            ? (
              <Banner
                tone="warning"
                title="Problema con il pagamento"
                message="Aggiorna il metodo di pagamento per non perdere l'accesso."
                actionLabel="Aggiorna"
                onAction={() => void openManageSubscriptions()}
              />
            )
            : null}

          {/* Tipo di post */}
          <View>
            <SectionLabel>Che post è?</SectionLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {POST_TYPES.map((type) => (
                <Chip
                  key={type}
                  label={POST_TYPE_META[type].label}
                  emoji={POST_TYPE_META[type].emoji}
                  selected={gen.postType === type}
                  onPress={() => gen.setPostType(type)}
                />
              ))}
            </View>
          </View>

          {/* Tono */}
          <View>
            <SectionLabel>Che tono?</SectionLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {TONES.map((tone) => {
                const locked = plan !== null && !canUseTone(plan, tone);
                return (
                  <Chip
                    key={tone}
                    label={TONE_META[tone].label}
                    emoji={TONE_META[tone].emoji}
                    selected={gen.tone === tone}
                    locked={locked}
                    onPress={() => (locked ? showUpgrade(upgradeCopy.tone(tone)) : gen.setTone(tone))}
                  />
                );
              })}
            </View>
            <Text style={{ ...typography.small, color: t.textFaint, marginTop: spacing.md }}>
              {TONE_META[gen.tone].description}
            </Text>
          </View>

          {/* Contesto */}
          <View>
            <SectionLabel
              right={
                <Text style={{ ...typography.small, color: t.textFaint, fontVariant: ["tabular-nums"] }}>
                  {gen.context.length}/{CONTEXT_MAX_LENGTH}
                </Text>
              }
            >
              Qualche dettaglio? (opzionale)
            </SectionLabel>
            <TextInput
              value={gen.context}
              onChangeText={(v) => gen.setContext(v.slice(0, CONTEXT_MAX_LENGTH))}
              placeholder="es. aperitivo sui Navigli, primo giorno di ferie"
              placeholderTextColor={t.textFaint}
              multiline
              maxLength={CONTEXT_MAX_LENGTH}
              accessibilityLabel="Contesto del post"
              style={{
                ...typography.body,
                color: t.text,
                minHeight: 92,
                textAlignVertical: "top",
                backgroundColor: t.surface,
                borderWidth: 1,
                borderColor: t.border,
                borderRadius: radius.md,
                padding: spacing.lg,
              }}
            />
            <Text style={{ ...typography.small, color: t.textFaint, marginTop: spacing.sm }}>
              Non salviamo quello che scrivi qui.
            </Text>
          </View>

          {/* Hashtag (Pro) */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.border,
              borderRadius: radius.md,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
              <Ionicons name="pricetags-outline" size={18} color={t.textMuted} />
              <Text style={{ ...typography.bodyStrong, color: t.text }}>Hashtag intelligenti</Text>
              {plan !== "pro"
                ? (
                  <View style={{ backgroundColor: t.accentSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                    <Text style={{ ...typography.label, fontSize: 10, color: t.accent }}>Pro</Text>
                  </View>
                )
                : null}
            </View>
            <Switch
              value={plan === "pro" && gen.includeHashtags}
              onValueChange={(v) => (plan === "pro" ? gen.setIncludeHashtags(v) : showUpgrade(upgradeCopy.hashtags()))}
              trackColor={{ true: t.accent, false: t.borderStrong }}
              thumbColor="#FFFFFF"
              accessibilityLabel="Hashtag intelligenti"
            />
          </View>

          {/* Risultati */}
          <View onLayout={(e) => setResultsY(e.nativeEvent.layout.y)} style={{ gap: spacing.lg }}>
            {gen.phase === "generating"
              ? (
                <Animated.View entering={FadeIn} style={{ gap: spacing.lg }}>
                  <SectionLabel>Sto scrivendo…</SectionLabel>
                  {Array.from({ length: skeletonCount }, (_, i) => (
                    <SkeletonCard key={i} lines={i % 2 ? [0.8, 0.5] : [0.95, 0.75, 0.4]} />
                  ))}
                </Animated.View>
              )
              : gen.captions.length
              ? (
                <>
                  <SectionLabel>{`Le tue caption · ${gen.captions.filter((c) => !c.refineAction).length}`}</SectionLabel>
                  {gen.captions.map((caption, i) => (
                    <CaptionCard
                      key={caption.id}
                      caption={caption}
                      index={gen.captions.slice(0, i).filter((c) => !c.refineAction).length - (caption.refineAction ? 1 : 0)}
                      plan={plan}
                      enterDelay={caption.refineAction ? 0 : i * 70}
                      refining={gen.refining?.captionId === caption.id ? gen.refining.action : null}
                      onRefine={hasAccess ? gen.refine : undefined}
                      onLocked={(action) => showUpgrade(upgradeCopy.refine(action))}
                    />
                  ))}
                </>
              )
              : null}
          </View>
        </ScrollView>

        {/* Barra CTA fissa */}
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg }}
        >
          <LinearGradient
            pointerEvents="none"
            colors={["transparent", t.background]}
            style={{ position: "absolute", left: 0, right: 0, top: -40, bottom: 0 }}
          />
          {bannerError
            ? (
              <View style={{ marginBottom: spacing.md }}>
                <Banner
                  tone={bannerError.code === "rate_limited" ? "warning" : "danger"}
                  title={bannerError.message}
                  actionLabel={bannerError.isRetryable ? "Riprova" : undefined}
                  onAction={bannerError.isRetryable ? () => void onGenerate() : undefined}
                />
              </View>
            )
            : null}
          <Button
            label={ctaLabel}
            icon={hasAccess && !outOfCredits ? "sparkles" : undefined}
            loading={gen.phase === "generating"}
            onPress={() => void onGenerate()}
          />
          <View style={{ height: insets.bottom > 0 ? 0 : spacing.xs }} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
