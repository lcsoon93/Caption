// Dialoghi cross-platform: su web `Alert.alert` di React Native non mostra nulla,
// quindi usiamo confirm/alert del browser.
import { Alert } from "react-native";
import { IS_WEB } from "./env";

export function notify(title: string, message?: string): void {
  if (IS_WEB) {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/** Chiede conferma per un'azione distruttiva. Risolve true se l'utente conferma. */
export function confirmDestructive(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (IS_WEB) return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Annulla", style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, style: "destructive", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
