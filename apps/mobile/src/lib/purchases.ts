// RevenueCat: l'app_user_id è sempre l'id utente Supabase, così webhook e
// sync-subscription sanno a chi assegnare l'abbonamento.

import type { PlanId } from "@caption/shared";
import { PLAN_IDS } from "@caption/shared";
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from "react-native-purchases";
import { api } from "./api";
import { env } from "./env";

let configured = false;

export async function initPurchases(userId: string): Promise<void> {
  if (!configured) {
    if (__DEV__) await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
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

export interface PlanPackage {
  plan: PlanId;
  pkg: PurchasesPackage;
  /** Prezzo localizzato dallo store (obbligatorio mostrarlo così). */
  priceString: string;
}

/**
 * Associa i package dell'offering corrente ai piani: l'identificatore prodotto deve
 * contenere l'id del piano (es. `caption_standard_monthly`), vedi README.
 */
export async function getPlanPackages(): Promise<PlanPackage[]> {
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  return PLAN_IDS.flatMap((plan) => {
    const pkg = packages.find((p) => p.product.identifier.toLowerCase().includes(plan));
    return pkg ? [{ plan, pkg, priceString: pkg.product.priceString }] : [];
  });
}

export async function purchasePlan(
  target: PlanPackage,
  currentProductId: string | null,
): Promise<{ cancelled: boolean }> {
  try {
    // Android: cambio piano dentro lo stesso abbonamento (su iOS lo gestisce il gruppo di abbonamento).
    const change = Platform.OS === "android" && currentProductId
      ? { oldProductIdentifier: currentProductId.split(":")[0] ?? currentProductId }
      : null;
    await Purchases.purchasePackage(target.pkg, null, change);
    await api.syncSubscription();
    return { cancelled: false };
  } catch (err) {
    if ((err as { userCancelled?: boolean }).userCancelled) return { cancelled: true };
    throw err;
  }
}

export async function restorePurchases(): Promise<CustomerInfo> {
  const info = await Purchases.restorePurchases();
  await api.syncSubscription();
  return info;
}

export function onCustomerInfoChange(listener: (info: CustomerInfo) => void): () => void {
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
}

export async function openManageSubscriptions(): Promise<void> {
  await Purchases.showManageSubscriptions();
}
