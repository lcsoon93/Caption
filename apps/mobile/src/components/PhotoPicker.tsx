// Foto del post (facoltativa): galleria o fotocamera, anteprima e rimozione.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { PressableScale } from "@/components/PressableScale";
import { notify } from "@/lib/dialog";
import { CAMERA_AVAILABLE, PhotoPermissionDenied, pickPostPhoto, type PostPhoto } from "@/lib/photo";
import { radius, spacing, typography } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

interface Props {
  photo: PostPhoto | null;
  onChange(photo: PostPhoto | null): void;
  disabled?: boolean;
}

export function PhotoPicker({ photo, onChange, disabled }: Props) {
  const t = useTheme();
  const [loading, setLoading] = useState(false);

  async function pick(source: "library" | "camera") {
    if (loading || disabled) return;
    setLoading(true);
    try {
      const picked = await pickPostPhoto(source);
      if (picked) onChange(picked);
    } catch (err) {
      if (err instanceof PhotoPermissionDenied) {
        notify("Serve il permesso", "Consenti l'accesso alla fotocamera dalle impostazioni del telefono.");
      } else {
        notify("Foto non caricata", "Non riusciamo a leggere questa foto. Prova con un'altra.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (photo) {
    return (
      <Animated.View
        entering={FadeIn}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: radius.md,
          padding: spacing.md,
        }}
      >
        <Image
          source={{ uri: photo.previewUri }}
          accessibilityLabel="Anteprima della foto"
          style={{ width: 64, height: 64, borderRadius: radius.sm, backgroundColor: t.surfaceElevated }}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ ...typography.bodyStrong, color: t.text }}>Foto aggiunta</Text>
          <Text style={{ ...typography.small, color: t.textMuted }}>Le caption partono da quello che si vede.</Text>
          <PressableScale onPress={() => void pick("library")} disabled={loading || disabled} haptic="selection">
            <Text style={{ ...typography.small, fontWeight: "600", color: t.accent }}>
              {loading ? "Caricamento…" : "Cambia foto"}
            </Text>
          </PressableScale>
        </View>
        <PressableScale
          onPress={() => onChange(null)}
          disabled={disabled}
          accessibilityLabel="Togli la foto"
          style={{ padding: spacing.sm }}
        >
          <Ionicons name="close-circle" size={24} color={t.textFaint} />
        </PressableScale>
      </Animated.View>
    );
  }

  return (
    <View
      style={{
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: t.borderStrong,
        borderRadius: radius.md,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Ionicons name="image-outline" size={20} color={t.textMuted} />
        <Text style={{ ...typography.bodyStrong, color: t.text, flex: 1 }}>Aggiungi la foto del post</Text>
        {loading ? <ActivityIndicator color={t.accent} /> : null}
      </View>
      <Text style={{ ...typography.small, color: t.textMuted }}>
        Facoltativa: con la foto le caption parlano di quello che si vede. Non la salviamo.
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <PickButton icon="images-outline" label="Galleria" onPress={() => void pick("library")} disabled={loading || disabled} />
        {CAMERA_AVAILABLE
          ? <PickButton icon="camera-outline" label="Scatta" onPress={() => void pick("camera")} disabled={loading || disabled} />
          : null}
      </View>
    </View>
  );
}

function PickButton({ icon, label, onPress, disabled }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress(): void;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic="selection"
      accessibilityRole="button"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        backgroundColor: t.surfaceElevated,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Ionicons name={icon} size={16} color={t.text} />
      <Text style={{ ...typography.small, fontWeight: "600", color: t.text }}>{label}</Text>
    </PressableScale>
  );
}
