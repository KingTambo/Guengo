import { createClient } from "@supabase/supabase-js";
import { fetchAppConfig } from "../api/config";

/**
 * Après `signInWithOAuth`, Supabase redirige vers `/app?code=…` (PKCE).
 * Échange le `code` contre une session stockée par le client.
 */
export async function hydrateSupabaseOAuthFromUrl(): Promise<void> {
  if (!/[?&]code=/.test(window.location.href)) return;

  const config = await fetchAppConfig();
  const url = config.supabase_url;
  const anon = config.supabase_anon_key;
  if (!url || !anon) return;

  const supabase = createClient(url, anon);

  const callbackUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  const { error } = await supabase.auth.exchangeCodeForSession(callbackUrl);

  if (error) {
    console.warn("[guengo] Supabase OAuth:", error.message);
    return;
  }

  if (window.location.search.length > 0) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.hash}`,
    );
  }
}
