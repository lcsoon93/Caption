// Bottom sheet di upsell: compare quando l'utente tocca una funzione non inclusa nel piano
// o esaurisce le generazioni. Porta al paywall con il piano suggerito preselezionato.

import type { PlanId } from "@caption/shared";
import { PLANS } from "@caption/shared";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { analytics } from "@/lib/analytics";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

export interface UpgradeRequest {
  requiredPlan: PlanId;
  title: string;
  message: string;
  reason: "tone" | "refine" | "hashtags" | "quota" | "expired";
}

const UpgradeContext = createContext<((req: UpgradeRequest) => void) | null>(null);

export function UpgradeProvider({ children }: { children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [request, setRequest] = useState<UpgradeRequest | null>(null);

  const show = useCallback((req: UpgradeRequest) => {
    analytics.track("upgrade_prompt_viewed", { reason: req.reason, requiredPlan: req.requiredPlan });
    setRequest(req);
  }, []);
  const close = () => setRequest(null);
  const plan = request ? PLANS[request.requiredPlan] : null;

  return (
    <UpgradeContext.Provider value={show}>
      {children}
      <Modal visible={request !== null} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: t.overlay }} onPress={close} accessibilityLabel="Chiudi" />
        {request && plan
          ? (
            <View
              style={{
                width: "100%",
                maxWidth: 520,
                alignSelf: "center",
                backgroundColor: t.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
                borderWidth: 1,
                borderColor: t.border,
                padding: spacing.xl,
                paddingBottom: insets.bottom + spacing.xl,
                gap: spacing.lg,
              }}
            >
              <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: t.borderStrong }} />
              <View
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.accentSoft, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="sparkles" size={22} color={t.accent} />
              </View>
              <View style={{ gap: spacing.sm }}>
                <Text style={{ ...typography.title, color: t.text }}>{request.title}</Text>
                <Text style={{ ...typography.body, color: t.textMuted }}>{request.message}</Text>
              </View>
              <View style={{ backgroundColor: t.surfaceElevated, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm }}>
                <Text style={{ ...typography.label, color: t.accent }}>Con {plan.name}</Text>
                {plan.features.map((f) => (
                  <View key={f} style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                    <Ionicons name="checkmark" size={16} color={t.text} />
                    <Text style={{ ...typography.body, color: t.text }}>{f}</Text>
                  </View>
                ))}
              </View>
              <Button
                label="Vedi i piani"
                onPress={() => {
                  const target = request.requiredPlan;
                  close();
                  router.push({ pathname: "/paywall", params: { plan: target, mode: "upgrade" } });
                }}
              />
              <Button label="Non ora" variant="ghost" haptic="none" onPress={close} />
            </View>
          )
          : null}
      </Modal>
    </UpgradeContext.Provider>
  );
}

export function useUpgrade(): (req: UpgradeRequest) => void {
  const ctx = useContext(UpgradeContext);
  if (!ctx) throw new Error("useUpgrade va usato dentro <UpgradeProvider>");
  return ctx;
}

