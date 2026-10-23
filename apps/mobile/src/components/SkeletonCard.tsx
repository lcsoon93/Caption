import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { radius, spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

/** Segnaposto durante la generazione: righe che "respirano". */
export function SkeletonCard({ lines = [0.92, 0.7, 0.45] }: { lines?: number[] }) {
  const t = useTheme();
  const pulse = useSharedValue(0.35);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View
      style={{ backgroundColor: t.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, padding: spacing.xl, gap: spacing.md }}
    >
      <Animated.View style={[{ width: 28, height: 10, borderRadius: 5, backgroundColor: t.surfaceElevated }, style]} />
      {lines.map((w, i) => (
        <Animated.View
          key={i}
          style={[{ width: `${w * 100}%`, height: 18, borderRadius: 9, backgroundColor: t.surfaceElevated }, style]}
        />
      ))}
    </View>
  );
}
