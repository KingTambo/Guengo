import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@supabase/supabase-js";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { fetchAppConfig } from "../api/config";
import { hydrateSupabaseOAuthFromUrl } from "../lib/supabaseOAuthHydrate";

export type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  /** true si SUPABASE_* est exposé par l’API — /app exige une session */
  authRequired: boolean;
  supabase: SupabaseClient | null;
};

const AuthContext = createContext<AuthContextValue>({
  loading: true,
  session: null,
  authRequired: false,
  supabase: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      try {
        await hydrateSupabaseOAuthFromUrl();

        const config = await fetchAppConfig();
        if (!config.supabase_url?.length || !config.supabase_anon_key?.length) {
          if (!cancelled) {
            setAuthRequired(false);
            setSupabase(null);
            setSession(null);
          }
          return;
        }

        const client = createClient(
          config.supabase_url,
          config.supabase_anon_key,
        );
        if (cancelled) return;

        setSupabase(client);
        setAuthRequired(true);

        const {
          data: { session: initial },
        } = await client.auth.getSession();
        if (cancelled) return;
        setSession(initial);

        const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
          if (!cancelled) setSession(next);
        });
        unsubscribe = () => sub.subscription.unsubscribe();
      } catch {
        if (!cancelled) {
          setAuthRequired(false);
          setSupabase(null);
          setSession(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo(
    () => ({ loading, session, authRequired, supabase }),
    [loading, session, authRequired, supabase],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
