// Versione web: gli acquisti in-app non esistono nel browser. Finché non attiviamo
// RevenueCat Web Billing (Stripe), sul web l'abbonamento si gestisce dall'app mobile
// e qui le funzioni sono no-op con la stessa firma di purchases.ts.

import type { PlanId } from "@caption/shared";
import type { CustomerInfo, PurchasesPackage } from "react-native-purchases";

export const PURCHASES_AVAILABLE = false;

export interface PlanPackage {
  plan: PlanId;
  pkg: PurchasesPackage;
  priceString: string;
}

export async function initPurchases(_userId: string): Promise<void> {}

export async function resetPurchases(): Promise<void> {}

export async function getPlanPackages(): Promise<PlanPackage[]> {
  return [];
}

export async function purchasePlan(_target: PlanPackage, _currentProductId: string | null): Promise<{ cancelled: boolean }> {
  return { cancelled: true };
}

export async function restorePurchases(): Promise<CustomerInfo | null> {
  return null;
}

export function onCustomerInfoChange(_listener: (info: CustomerInfo) => void): () => void {
  return () => undefined;
}

export async function openManageSubscriptions(): Promise<void> {}
