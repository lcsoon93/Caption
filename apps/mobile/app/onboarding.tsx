// Onboarding in 3 passi: valore → esempio concreto → azione. Porta al login e poi al paywall.
import { POST_TYPE_META, TONE_META } from "@caption/shared";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { FlatList, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { useSession } from "@/providers/SessionProvider";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

interface Slide {
  key: string;
  title: string;
  body: string;
  visual(): React.ReactNode;
}

function MoodVisual() {
  const chips: Array<[string, string, boolean]> = [
    [POST_TYPE_META.viaggio.label, POST_TYPE_META.viaggio.emoji, true],
    [POST_TYPE_META.cibo.label, POST_TYPE_META.cibo.emoji, false],
    [POST_TYPE_META.selfie.label, POST_TYPE_META.selfie.emoji, false],
    [TONE_META.ironico.label, TONE_META.ironico.emoji, true],
    [TONE_META.poetico.label, TONE_META.poetico.emoji, false],
    [TONE_META.main_character.label, TONE_META.main_character.emoji, false],
    [TONE_META.minimal.label, TONE_META.minimal.emoji, false],
  ];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center" }}>
      {chips.map(([label, emoji, selected], i) => (
        <Animated.View key={label} entering={FadeInDown.delay(i * 60).springify()}>
          <Chip label={label} emoji={emoji} selected={selected} onPress={() => undefined} />
        </Animated.View>
      ))}
    </View>
  );
}

function CardVisual() {
  const t = useTheme();
  const samples = ["Lisbona mi ha dato pioggia e io le ho dato il mio miglior outfit.", "Piove, ma con stile."];
  return (
    <View style={{ gap: spacing.md, width: "100%" }}>
      {samples.map((text, i) => (
        <Animated.View
          key={text}
          entering={FadeInDown.delay(i * 120).springify()}
          style={{ backgroundColor: t.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, padding: spacing.xl, gap: spacing.sm }}
        >
          <Text style={{ ...typography.label, color: t.textFaint }}>{String(i + 1).padStart(2, "0")}</Text>
          <Text style={{ ...typography.caption, color: t.text }}>{text}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

function ActionVisual() {
  const t = useTheme();
  const steps: Array<[keyof typeof Ionicons.glyphMap, string]> = [
    ["copy-outline", "Copia con un tocco"],
    ["color-wand-outline", "Più corta, più poetica, più ironica"],
    ["share-outline", "Condividi dove vuoi"],
  ];
  return (
    <View style={{ gap: spacing.md, width: "100%" }}>
      {steps.map(([icon, label], i) => (
        <Animated.View
          key={label}
          entering={FadeInDown.delay(i * 90).springify()}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg, backgroundColor: t.surface, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, padding: spacing.lg }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.accentSoft, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={icon} size={20} color={t.accent} />
          </View>
          <Text style={{ ...typography.bodyStrong, color: t.text, flex: 1 }}>{label}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

const SLIDES: Slide[] = [
  { key: "mood", title: "Scegli il post.\nScegli il mood.", body: "Selfie, viaggio, cibo, palestra. Ironico, poetico, minimal. Tu decidi l'atmosfera.", visual: MoodVisual },
  { key: "cards", title: "Caption che\nsembrano tue.", body: "Italiano vero, zero frasi da AI. Diverse versioni in pochi secondi, una più bella dell'altra.", visual: CardVisual },
  { key: "action", title: "Copia. Rifinisci.\nPubblica.", body: "Ogni caption si adatta con un tocco. Il tuo storico resta sempre a portata di mano.", visual: ActionVisual },
];

function Dot({ active }: { active: boolean }) {
  const t = useTheme();
  const style = useAnimatedStyle(() => ({ width: withSpring(active ? 22 : 6), opacity: withSpring(active ? 1 : 0.4) }));
  return <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: t.text }, style]} />;
}

export default function Onboarding() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { completeOnboarding } = useSession();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);
  const last = index === SLIDES.length - 1;

  async function next() {
    if (!last) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
      setIndex(index + 1);
      return;
    }
    await completeOnboarding();
    router.replace("/sign-in");
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.background, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.key}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => (
          <View style={{ width, padding: spacing.xl, justifyContent: "space-between", gap: spacing.xxl }}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              {Math.abs(i - index) <= 1 ? <item.visual /> : null}
            </View>
            <View style={{ gap: spacing.md }}>
              <Text style={{ ...typography.hero, color: t.text }}>{item.title}</Text>
              <Text style={{ ...typography.body, color: t.textMuted, fontSize: 17, lineHeight: 24 }}>{item.body}</Text>
            </View>
          </View>
        )}
      />
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.xl }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {SLIDES.map((s, i) => <Dot key={s.key} active={i === index} />)}
        </View>
        <Button label={last ? "Inizia" : "Avanti"} onPress={() => void next()} />
      </View>
    </View>
  );
}
