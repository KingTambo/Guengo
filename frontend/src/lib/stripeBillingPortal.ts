import type { SupabaseClient } from "@supabase/supabase-js";

export async function openStripeBillingPortal(
  supabase: SupabaseClient,
): Promise<{ error?: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return { error: "Session introuvable. Reconnectez-vous." };
  }

  const resp = await fetch("/api/stripe/portal", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "",
  });

  if (!resp.ok) {
    return {
      error:
        resp.status === 503
          ? "Gestion d’abonnement indisponible (configuration Stripe incomplète)."
          : resp.status === 502
            ? "Impossible d’ouvrir le portail Stripe."
            : `Erreur HTTP ${resp.status}.`,
    };
  }

  let parsed: { portal_url?: string };
  try {
    parsed = JSON.parse(await resp.text()) as { portal_url?: string };
  } catch {
    return { error: "Réponse serveur invalide." };
  }

  if (!parsed.portal_url) {
    return { error: "Réponse serveur invalide." };
  }

  window.location.assign(parsed.portal_url);
  return {};
}
