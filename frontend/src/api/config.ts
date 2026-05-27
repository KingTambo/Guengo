export type AppConfig = {
  gemini_live: boolean;
  gemini_live_model: string;
  /** OAuth (Google etc.) — présents si SUPABASE_* est défini sur l’API */
  supabase_url?: string;
  supabase_anon_key?: string;
  /** Stripe publishable — jamais la clé secrète sur le client */
  stripe_publishable_key?: string;
  /** true si l’API a tout configuré pour checkout + webhook (voir `.env.example`) */
  stripe_paywall_enabled?: boolean;
};

let cached: AppConfig | null = null;

/** Invalider le cache (ex. retour paiement Stripe). */
export function clearAppConfigCache() {
  cached = null;
}

export async function fetchAppConfig(options?: {
  bypassCache?: boolean;
}): Promise<AppConfig> {
  if (options?.bypassCache) cached = null;
  if (cached) return cached;

  const response = await fetch("/api/config");
  if (!response.ok) {
    throw new Error("Configuration indisponible.");
  }

  cached = (await response.json()) as AppConfig;
  return cached;
}
