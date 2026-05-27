import type { SupabaseClient } from "@supabase/supabase-js";

export async function startStripeCheckout(
  supabase: SupabaseClient,
): Promise<{ error?: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return { error: "Session introuvable. Reconnectez-vous." };
  }

  const resp = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "",
  });

  const bodyRaw = await resp.text();
  if (!resp.ok) {
    return {
      error:
        resp.status === 503
          ? "Paiement indisponible (configuration Stripe incomplète côté serveur)."
          : `Paiement : erreur HTTP ${resp.status}.`,
    };
  }

  let parsed: { checkout_url?: string };
  try {
    parsed = JSON.parse(bodyRaw) as { checkout_url?: string };
  } catch {
    return { error: "Réponse paiement invalide." };
  }
  if (!parsed.checkout_url) {
    return { error: "Réponse paiement invalide." };
  }

  window.location.assign(parsed.checkout_url);
  return {};
}
