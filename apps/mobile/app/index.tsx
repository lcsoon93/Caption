// Gate di navigazione: niente sessione → login; niente abbonamento → paywall; altrimenti home.
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "@/providers/SessionProvider";
import { useTheme } from "@/theme/useTheme";

export default function Index() {
  const { session, status, loading } = useSession();
  const theme = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }
  if (!session) return <Redirect href="/sign-in" />;
  if (!status?.hasAccess) return <Redirect href="/paywall" />;
  return <Redirect href="/home" />;
}
