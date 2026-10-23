import type { UsageDTO } from "@caption/shared";
import type { Session } from "@supabase/supabase-js";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { analytics } from "@/lib/analytics";
import { type AccountStatus, api } from "@/lib/api";
import { initPurchases, onCustomerInfoChange, resetPurchases } from "@/lib/purchases";
import { storage } from "@/lib/storage";
import { supabase } from "@/lib/supabase";

interface SessionContextValue {
  session: Session | null;
  loading: boolean;
  onboardingSeen: boolean;
  status: AccountStatus | null;
  statusError: boolean;
  refreshStatus(): Promise<void>;
  /** Aggiorna il contatore con i dati restituiti da una generazione (niente round-trip). */
  applyUsage(usage: UsageDTO): void;
  completeOnboarding(): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [onboardingSeen, setOnboardingSeen] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [statusReady, setStatusReady] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.status());
      setStatusError(false);
    } catch {
      setStatusError(true);
    }
  }, []);

  useEffect(() => {
    void analytics.init();
    void Promise.all([supabase.auth.getSession(), storage.getOnboardingSeen()]).then(([{ data }, seen]) => {
      setSession(data.session);
      setOnboardingSeen(seen);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  // Al login: RevenueCat identificato con l'id Supabase + stato abbonamento dal backend.
  useEffect(() => {
    if (!userId) {
      setStatus(null);
      setStatusReady(true);
      return;
    }
    setStatusReady(false);
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        analytics.identify(userId);
        await initPurchases(userId);
        // Rinnovi/scadenze rilevati dall'SDK mentre l'app è aperta.
        unsubscribe = onCustomerInfoChange(() => {
          void api.syncSubscription().then(refreshStatus).catch(() => undefined);
        });
      } catch {
        // RevenueCat non disponibile: lo stato arriva comunque dal backend.
      }
      await refreshStatus();
      if (!cancelled) setStatusReady(true);
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [userId, refreshStatus]);

  const applyUsage = useCallback((usage: UsageDTO) => {
    setStatus((prev) =>
      prev
        ? { ...prev, plan: usage.plan, used: usage.used, limit: usage.limit, remaining: usage.remaining }
        : prev
    );
  }, []);

  const completeOnboarding = useCallback(async () => {
    await storage.setOnboardingSeen();
    setOnboardingSeen(true);
    analytics.track("onboarding_completed");
  }, []);

  const signOut = useCallback(async () => {
    await resetPurchases().catch(() => undefined);
    analytics.reset();
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      loading: !authReady || !statusReady,
      onboardingSeen,
      status,
      statusError,
      refreshStatus,
      applyUsage,
      completeOnboarding,
      signOut,
    }),
    [session, authReady, statusReady, onboardingSeen, status, statusError, refreshStatus, applyUsage, completeOnboarding, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession va usato dentro <SessionProvider>");
  return ctx;
}
