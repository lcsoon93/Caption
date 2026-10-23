import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "@/providers/SessionProvider";
import { UpgradeProvider } from "@/providers/UpgradeProvider";
import { useTheme } from "@/theme/useTheme";

export default function RootLayout() {
  const theme = useTheme();
  const scheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaProvider>
        <SessionProvider>
          <UpgradeProvider>
            <StatusBar style={scheme === "light" ? "dark" : "light"} />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
              <Stack.Screen name="index" options={{ animation: "fade" }} />
              <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
              <Stack.Screen name="sign-in" options={{ animation: "fade" }} />
              <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
              <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
            </Stack>
          </UpgradeProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
