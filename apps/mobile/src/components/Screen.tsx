import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/useTheme";

/** Contenitore base: sfondo del tema + inset superiore. */
export function Screen({ children, padTop = true }: { children: ReactNode; padTop?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: t.background, paddingTop: padTop ? insets.top : 0 }}>{children}</View>;
}
