import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useSession } from "@/providers/SessionProvider";
import { useTheme } from "@/theme/useTheme";

export default function TabsLayout() {
  const t = useTheme();
  const { session, loading } = useSession();
  if (!loading && !session) return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.textFaint,
        tabBarStyle: { backgroundColor: t.background, borderTopColor: t.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        sceneStyle: { backgroundColor: t.background },
      }}
    >
      <Tabs.Screen
        name="create"
        options={{
          title: "Crea",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "sparkles" : "sparkles-outline"} size={22} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Storico",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "time" : "time-outline"} size={22} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={23} color={color as string} />
          ),
        }}
      />
    </Tabs>
  );
}
