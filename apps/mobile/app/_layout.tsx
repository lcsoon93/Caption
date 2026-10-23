import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "@/providers/SessionProvider";
import { UpgradeProvider } from "@/providers/UpgradeProvider";
import { useTheme } from "@/theme/useTheme";

const WEB_MAX_WIDTH = 520;

export default function RootLayout() {
  const theme = useTheme();
  const scheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaProvider>
        <SessionProvider>
          <UpgradeProvider>
            <StatusBar style={scheme === "light" ? "dark" : "light"} />
            {/* Sul web l'app resta una colonna da telefono centrata anche su desktop. */}
            <View style={Platform.OS === "web" ? { flex: 1, width: "100%", maxWidth: WEB_MAX_WIDTH, alignSelf: "center" } : { flex: 1 }}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
              <Stack.Screen name="index" options={{ animation: "fade" }} />
              <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
              <Stack.Screen name="sign-in" options={{ animation: "fade" }} />
              <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
              <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
              <Stack.Screen name="auth-callback" options={{ animation: "none" }} />
            </Stack>
            </View>
          </UpgradeProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
