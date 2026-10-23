import type { CaptionDTO, PlanId, RefineAction } from "@caption/shared";
import { canUseRefineAction, REFINE_ACTION_META, REFINE_ACTIONS } from "@caption/shared";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Share, Text, View } from "react-native";
import Animated, { FadeInDown, LinearTransition, ZoomIn } from "react-native-reanimated";
import { analytics } from "@/lib/analytics";
import { captionForClipboard } from "@/lib/captionText";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";
import { PressableScale } from "./PressableScale";

interface Props {
  caption: CaptionDTO;
  index: number;
  plan: PlanId | null;
  /** Azione di rifinitura in corso su questa card (mostra lo spinner sul chip). */
  refining?: RefineAction | null;
  onRefine?(caption: CaptionDTO, action: RefineAction): void;
  onLocked?(action: RefineAction): void;
  /** Animazione d'ingresso a cascata. */
  enterDelay?: number;
  footer?: React.ReactNode;
}

export function CaptionCard({ caption, index, plan, refining, onRefine, onLocked, enterDelay = 0, footer }: Props) {
  const t = useTheme();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    await Clipboard.setStringAsync(captionForClipboard(caption));
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    analytics.track("caption_copied", { tone: caption.tone, postType: caption.postType, refined: !!caption.refineAction });
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  async function share() {
    try {
      const result = await Share.share({ message: captionForClipboard(caption) });
      if (result.action === Share.sharedAction) analytics.track("caption_shared", { tone: caption.tone });
    } catch {
      // Browser senza condivisione nativa (es. desktop): copiamo il testo.
      await copy();
    }
  }

  return (
    <Animated.View
      entering={FadeInDown.delay(enterDelay).springify().damping(18)}
      layout={LinearTransition.springify().damping(20)}
      style={{
        backgroundColor: t.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: caption.refineAction ? t.borderStrong : t.border,
        paddingTop: spacing.xl,
        paddingBottom: spacing.lg,
        gap: spacing.lg,
      }}
    >
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text style={{ ...typography.label, color: t.textFaint, fontVariant: ["tabular-nums"] }}>
            {caption.refineAction ? `↳ ${String(index + 1).padStart(2, "0")}` : String(index + 1).padStart(2, "0")}
          </Text>
          {caption.refineAction
            ? (
              <View style={{ backgroundColor: t.accentSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                <Text style={{ ...typography.label, fontSize: 10, color: t.accent }}>{REFINE_ACTION_META[caption.refineAction].label}</Text>
              </View>
            )
            : null}
        </View>
        <Text selectable style={{ ...typography.caption, color: t.text }}>{caption.text}</Text>
        {caption.hashtags.length
          ? <Text selectable style={{ ...typography.small, color: t.accent, lineHeight: 20 }}>{caption.hashtags.join(" ")}</Text>
          : null}
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg }}>
        <PressableScale
          onPress={copy}
          haptic="none"
          accessibilityLabel={copied ? "Copiata" : "Copia caption"}
          style={{
            flex: 1,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: spacing.sm,
            paddingVertical: spacing.md,
            borderRadius: radius.pill,
            backgroundColor: copied ? t.accent : t.surfaceElevated,
          }}
        >
          {copied
            ? (
              <Animated.View entering={ZoomIn.springify()} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Ionicons name="checkmark" size={18} color={t.accentText} />
                <Text style={{ ...typography.button, fontSize: 15, color: t.accentText }}>Copiata</Text>
              </Animated.View>
            )
            : (
              <>
                <Ionicons name="copy-outline" size={17} color={t.text} />
                <Text style={{ ...typography.button, fontSize: 15, color: t.text }}>Copia</Text>
              </>
            )}
        </PressableScale>
        <PressableScale
          onPress={share}
          accessibilityLabel="Condividi caption"
          style={{
            width: 48,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: radius.pill,
            backgroundColor: t.surfaceElevated,
          }}
        >
          <Ionicons name="share-outline" size={19} color={t.text} />
        </PressableScale>
      </View>

      {onRefine
        ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
          >
            {REFINE_ACTIONS.map((action) => {
              const allowed = plan !== null && canUseRefineAction(plan, action);
              const busy = refining === action;
              return (
                <PressableScale
                  key={action}
                  haptic="selection"
                  disabled={!!refining && !busy}
                  accessibilityLabel={allowed ? REFINE_ACTION_META[action].label : `${REFINE_ACTION_META[action].label}, piano superiore`}
                  onPress={() => (allowed ? onRefine(caption, action) : onLocked?.(action))}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.xs,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: t.border,
                  }}
                >
                  {busy ? <ActivityIndicator size="small" color={t.accent} /> : null}
                  <Text style={{ ...typography.small, fontWeight: "600", color: allowed ? t.textMuted : t.textFaint }}>
                    {REFINE_ACTION_META[action].label}
                  </Text>
                  {allowed ? null : <Ionicons name="lock-closed" size={11} color={t.textFaint} />}
                </PressableScale>
              );
            })}
          </ScrollView>
        )
        : null}
      {footer ? <View style={{ paddingHorizontal: spacing.lg }}>{footer}</View> : null}
    </Animated.View>
  );
}
