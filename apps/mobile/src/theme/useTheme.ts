import { useColorScheme } from "react-native";
import { colors, type Palette } from "./tokens";

/** Dark di default: il light si attiva solo se il sistema lo richiede esplicitamente. */
export function useTheme(): Palette {
  return useColorScheme() === "light" ? colors.light : colors.dark;
}
