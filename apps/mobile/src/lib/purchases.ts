// RevenueCat: l'app_user_id è sempre l'id utente Supabase, così webhook e
// sync-subscription sanno a chi assegnare l'abbonamento.

import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import { api } from "./api";
import { env } from "./env";

let configured = false;

export async function initPurchases(userId: string): Promise<void> {
  if (!configured) {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey: env.revenueCatKey, appUserID: userId });
    configured = true;
    return;
  }
  const current = await Purchases.getAppUserID();
  if (current !== userId) await Purchases.logIn(userId);
}

export async function resetPurchases(): Promise<void> {
  if (configured && !(await Purchases.isAnonymous())) await Purchases.logOut();
}

/** Allinea subito il backend dopo un acquisto/ripristino (il webhook arriva comunque). */
async function syncBackend(): Promise<void> {
  await api.syncSubscription();
}

export async function getOfferingPackages(): Promise<PurchasesPackage[]> {
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function purchase(pkg: PurchasesPackage): Promise<{ cancelled: boolean }> {
  try {
    await Purchases.purchasePackage(pkg);
    await syncBackend();
    return { cancelled: false };
  } catch (err) {
    if ((err as { userCancelled?: boolean }).userCancelled) return { cancelled: true };
    throw err;
  }
}

export async function restore(): Promise<CustomerInfo> {
  const info = await Purchases.restorePurchases();
  await syncBackend();
  return info;
}

/**
 * Paywall nativo RevenueCat (configurabile da dashboard, A/B test inclusi).
 * Restituisce true se l'utente ha acquistato o ripristinato.
 */
export async function presentPaywall(): Promise<boolean> {
  const result = await RevenueCatUI.presentPaywall();
  const success = result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
  if (success) await syncBackend();
  return success;
}

export function onCustomerInfoChange(listener: (info: CustomerInfo) => void): () => void {
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
}

export async function openManageSubscriptions(): Promise<void> {
  await Purchases.showManageSubscriptions();
}
