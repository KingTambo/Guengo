import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * OAuth Google — le client doit être celui du même projet que l’API (/api/config).
 */
export async function signInWithGoogle(
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/app`,
    },
  });
  if (error) throw error;
}
