import type { SupabaseClient } from "@supabase/supabase-js";
import { navigateReplace } from "../router";
import { fetchGateProfile, isOnboardingComplete } from "./profileGate";

/** Où envoyer un utilisateur déjà connecté (login, garde SPA, OAuth). */
export async function resolveAuthenticatedPath(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const profile = await fetchGateProfile(supabase, userId);

  if (!profile) return "/app";

  if (profile.is_premium) return "/app";

  if (isOnboardingComplete(profile)) {
    return "/paywall";
  }

  return "/app";
}

export async function navigateAfterAuth(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  navigateReplace(await resolveAuthenticatedPath(supabase, userId));
}
