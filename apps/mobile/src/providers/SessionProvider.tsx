import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type AccountStatus } from "@/lib/api";
import { initPurchases, onCustomerInfoChange, resetPurchases } from "@/lib/purchases";
import { supabase } from "@/lib/supabase";

interface SessionContextValue {
  session: Session | null;
  loading: boolean;
  status: AccountStatus | null;
  refreshStatus(): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    setStatus(await api.status());
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // Al login: RevenueCat identificato con l'id Supabase + stato abbonamento dal backend.
  useEffect(() => {
    if (!session) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        await initPurchases(session.user.id);
        // Rinnovi/scadenze rilevati dall'SDK mentre l'app è aperta.
        unsubscribe = onCustomerInfoChange(() => {
          void api.syncSubscription().then(refreshStatus).catch(() => undefined);
        });
        await refreshStatus();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [session?.user.id, refreshStatus]);

  const signOut = useCallback(async () => {
    await resetPurchases();
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ session, loading, status, refreshStatus, signOut }),
    [session, loading, status, refreshStatus, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession va usato dentro <SessionProvider>");
  return ctx;
}
