import { PLANS, POST_TYPE_META, TONE_META } from "@caption/shared";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { CaptionCard } from "@/components/CaptionCard";
import { PressableScale } from "@/components/PressableScale";
import { Screen } from "@/components/Screen";
import { api, type HistoryItem } from "@/lib/api";
import { confirmDestructive } from "@/lib/dialog";
import { useSession } from "@/providers/SessionProvider";
import { useUpgrade } from "@/providers/UpgradeProvider";
import { spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

const PAGE = 30;

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `Oggi, ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
  if (d.toDateString() === yesterday.toDateString()) return "Ieri";
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

export default function History() {
  const t = useTheme();
  const { status } = useSession();
  const showUpgrade = useUpgrade();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loadingMore = useRef(false);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setRefreshing(true);
    try {
      const page = await api.history({ limit: PAGE });
      setItems(page);
      setHasMore(page.length === PAGE);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load("initial");
  }, [load]));

  async function loadMore() {
    const last = items.at(-1);
    if (!hasMore || loadingMore.current || !last) return;
    loadingMore.current = true;
    try {
      const page = await api.history({ before: last.createdAt, limit: PAGE });
      setItems((prev) => [...prev, ...page]);
      setHasMore(page.length === PAGE);
    } finally {
      loadingMore.current = false;
    }
  }

  async function toggleFavorite(item: HistoryItem) {
    setItems((prev) => prev.map((c) => (c.id === item.id ? { ...c, isFavorite: !c.isFavorite } : c)));
    try {
      await api.setFavorite(item.id, !item.isFavorite);
    } catch {
      setItems((prev) => prev.map((c) => (c.id === item.id ? { ...c, isFavorite: item.isFavorite } : c)));
    }
  }

  async function confirmDelete(item: HistoryItem) {
    if (!(await confirmDestructive("Eliminare questa caption?", "Non potrai recuperarla.", "Elimina"))) return;
    const before = items;
    setItems((prev) => prev.filter((c) => c.id !== item.id));
    try {
      await api.deleteCaption(item.id);
    } catch {
      setItems(before);
    }
  }

  const historyLimit = status?.plan ? PLANS[status.plan].historyLimit : null;

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={t.accent} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => void loadMore()}
        ListHeaderComponent={
          <View style={{ gap: spacing.lg, marginBottom: spacing.sm }}>
            <Text style={{ ...typography.display, color: t.text }}>Storico</Text>
            {historyLimit !== null
              ? (
                <Banner
                  tone="info"
                  title={`Il piano ${PLANS[status!.plan!].name} conserva le ultime ${historyLimit} caption`}
                  actionLabel="Storico completo con Standard"
                  onAction={() =>
                    showUpgrade({
                      reason: "quota",
                      requiredPlan: "standard",
                      title: "Tieni tutte le tue caption",
                      message: "Con Standard lo storico è completo e puoi rifinire ogni caption.",
                    })}
                />
              )
              : null}
            {error ? <Banner tone="danger" title="Impossibile caricare lo storico" actionLabel="Riprova" onAction={() => void load("refresh")} /> : null}
          </View>
        }
        ListEmptyComponent={loading
          ? <ActivityIndicator color={t.accent} style={{ marginTop: spacing.xxxl }} />
          : error
          ? undefined
          : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg, paddingBottom: spacing.xxxl }}>
              <Text style={{ fontSize: 44 }}>✍️</Text>
              <Text style={{ ...typography.title, color: t.text, textAlign: "center" }}>Ancora niente qui</Text>
              <Text style={{ ...typography.body, color: t.textMuted, textAlign: "center" }}>
                Le caption che generi appariranno in questo spazio.
              </Text>
              <Button label="Crea la prima" icon="sparkles" size="md" onPress={() => router.navigate("/create")} />
            </View>
          )}
        renderItem={({ item, index }) => (
          <CaptionCard
            caption={item}
            index={index}
            plan={status?.plan ?? null}
            enterDelay={Math.min(index, 6) * 40}
            footer={
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xs }}>
                <Text style={{ ...typography.small, color: t.textFaint }}>
                  {POST_TYPE_META[item.postType].emoji} {POST_TYPE_META[item.postType].label} · {TONE_META[item.tone].label} ·{" "}
                  {formatDate(item.createdAt)}
                </Text>
                <View style={{ flexDirection: "row", gap: spacing.lg }}>
                  <PressableScale
                    haptic="selection"
                    onPress={() => void toggleFavorite(item)}
                    accessibilityLabel={item.isFavorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
                    hitSlop={10}
                  >
                    <Ionicons name={item.isFavorite ? "star" : "star-outline"} size={19} color={item.isFavorite ? t.accent : t.textMuted} />
                  </PressableScale>
                  <PressableScale onPress={() => void confirmDelete(item)} accessibilityLabel="Elimina caption" hitSlop={10}>
                    <Ionicons name="trash-outline" size={19} color={t.textMuted} />
                  </PressableScale>
                </View>
              </View>
            }
          />
        )}
      />
    </Screen>
  );
}
