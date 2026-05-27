import type { SupabaseClient } from "@supabase/supabase-js";
import { navigate } from "../router";

export async function signOutAndGoToLogin(
  client: SupabaseClient | null,
): Promise<void> {
  try {
    if (client) await client.auth.signOut();
  } catch {
    // ignore
  }
  navigate("/login");
}
