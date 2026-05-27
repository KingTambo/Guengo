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

declare const __GUENGO_BUILD_PUBLIC_CONFIG__: {
  supabase_url?: string;
  supabase_anon_key?: string;
  stripe_publishable_key?: string;
};

let cached: AppConfig | null = null;

function buildTimePublicConfig(): Pick<
  AppConfig,
  "supabase_url" | "supabase_anon_key" | "stripe_publishable_key"
> {
  try {
    const raw = __GUENGO_BUILD_PUBLIC_CONFIG__;
    return {
      supabase_url: raw.supabase_url || undefined,
      supabase_anon_key: raw.supabase_anon_key || undefined,
      stripe_publishable_key: raw.stripe_publishable_key || undefined,
    };
  } catch {
    return {};
  }
}

function mergeWithBuildPublicConfig(config: AppConfig): AppConfig {
  const baked = buildTimePublicConfig();
  return {
    ...config,
    supabase_url: config.supabase_url || baked.supabase_url,
    supabase_anon_key: config.supabase_anon_key || baked.supabase_anon_key,
    stripe_publishable_key:
      config.stripe_publishable_key || baked.stripe_publishable_key,
  };
}

function configFromBuildOnly(): AppConfig | null {
  const baked = buildTimePublicConfig();
  if (!baked.supabase_url?.length || !baked.supabase_anon_key?.length) {
    return null;
  }
  return {
    gemini_live: false,
    gemini_live_model: "",
    ...baked,
    stripe_paywall_enabled: false,
  };
}

/** Invalider le cache (ex. retour paiement Stripe). */
export function clearAppConfigCache() {
  cached = null;
}

export async function fetchAppConfig(options?: {
  bypassCache?: boolean;
}): Promise<AppConfig> {
  if (options?.bypassCache) cached = null;
  if (cached) return cached;

  try {
    const response = await fetch("/api/config");
    if (response.ok) {
      cached = mergeWithBuildPublicConfig(
        (await response.json()) as AppConfig,
      );
      return cached;
    }
  } catch {
    /* static host (Vercel) or API down — fall back to build-time public config */
  }

  const fromBuild = configFromBuildOnly();
  if (fromBuild) {
    cached = fromBuild;
    return cached;
  }

  throw new Error("Configuration indisponible.");
}
