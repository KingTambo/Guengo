import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { fetchAppConfig, clearAppConfigCache } from "../api/config";
import { fetchGateProfile, isOnboardingComplete } from "../lib/profileGate";
import { startStripeCheckout } from "../lib/stripeCheckout";
import { navigateReplace } from "../router";

const PREMIUM_FEATURES = [
  "Sessions vocales avec le tuteur Guengo",
  "Conversations courtes adaptées à votre niveau",
  "Bilingue français / anglais — progressez à votre rythme",
  "Tous les thèmes et parcours de conversation",
  "Annulez à tout moment, sans engagement longue durée",
] as const;

const MONTHLY_PRICE_EUR = 17;

function PaywallCheckIcon() {
  return (
    <svg
      className="paywall-features__icon"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <rect width="20" height="20" rx="6" fill="currentColor" opacity="0.1" />
      <path
        d="M6 10.2 8.6 12.8 14 7.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PaywallVoiceIcon() {
  return (
    <svg
      className="paywall-card__mark-icon"
      width="28"
      height="28"
      viewBox="0 0 28 28"
      aria-hidden="true"
    >
      <rect width="28" height="28" rx="9" fill="currentColor" opacity="0.14" />
      <path
        d="M14 6.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M10 14.5a4 4 0 0 0 8 0M14 18.5v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Paywall après onboarding : vérifie `profiles.is_premium` sur Supabase.
 * Premium → /app ; sinon abonnement Stripe puis retour ici jusqu’à activation.
 */
export function PaywallPage() {
  const { loading: authLoading, session, authRequired, supabase } = useAuth();
  const [bootLoading, setBootLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [stripePaywallEnabled, setStripePaywallEnabled] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [activating, setActivating] = useState(false);

  const bootstrap = useCallback(async (options?: { silent?: boolean }) => {
    if (!supabase || !session?.user?.id) {
      if (!options?.silent) setBootLoading(false);
      return;
    }
    setProfileError(null);
    if (!options?.silent) setBootLoading(true);
    try {
      const cfg = await fetchAppConfig();
      const paywallOn = Boolean(cfg.stripe_paywall_enabled);
      setStripePaywallEnabled(paywallOn);

      const row = await fetchGateProfile(supabase, session.user.id);
      if (!row) {
        setProfileError(
          "Votre profil n’est pas encore prêt. Réessayez dans un instant.",
        );
        return;
      }

      if (row.is_premium) {
        navigateReplace("/app");
        return;
      }

      if (!isOnboardingComplete(row)) {
        navigateReplace("/app");
        return;
      }
    } catch (err) {
      setProfileError(
        err instanceof Error
          ? err.message
          : "Impossible de charger votre profil.",
      );
    } finally {
      if (!options?.silent) setBootLoading(false);
    }
  }, [session?.user?.id, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!authRequired || !session || !supabase) {
      setBootLoading(false);
      return;
    }
    void bootstrap();
  }, [authLoading, authRequired, session, supabase, bootstrap]);

  /** Retour Stripe Checkout — le webhook peut mettre quelques secondes. */
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !session?.user?.id ||
      !authRequired ||
      !supabase
    ) {
      return;
    }

    const q = new URLSearchParams(window.location.search);
    if (q.get("checkout") !== "success") return;

    setActivating(true);
    clearAppConfigCache();
    window.history.replaceState(null, "", window.location.pathname);

    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      void bootstrap({ silent: true });
      if (n >= 12) {
        window.clearInterval(id);
        setActivating(false);
      }
    }, 2200);

    void bootstrap({ silent: true });

    return () => window.clearInterval(id);
  }, [authRequired, session?.user?.id, supabase, bootstrap]);

  async function handleCheckout() {
    if (!supabase) return;
    setCheckoutBusy(true);
    setProfileError(null);
    try {
      const { error } = await startStripeCheckout(supabase);
      if (error) setProfileError(error);
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "Impossible de lancer la caisse.",
      );
    } finally {
      setCheckoutBusy(false);
    }
  }

  if (!authRequired || !session || !supabase) {
    return null;
  }

  if (authLoading || bootLoading) {
    return (
      <div className="page page--paywall page--paywall-loading" role="status">
        <p className="page--auth-gate__text">Chargement…</p>
      </div>
    );
  }

  const statusMessage = activating
    ? "Paiement reçu — activation de votre accès en cours…"
    : !stripePaywallEnabled
      ? "Le paiement n’est pas encore activé sur cet environnement."
      : null;

  const dailyPrice = (MONTHLY_PRICE_EUR / 30).toFixed(2).replace(".", ",");

  return (
    <div className="page page--paywall">
      <div className="paywall-glow" aria-hidden="true" />

      <header className="paywall-nav">
        <span className="paywall-nav__brand">Guengo</span>
      </header>

      <main className="paywall-shell">
        <div className="paywall-layout">
          <div className="paywall-intro">
            <p className="paywall-intro__eyebrow">Votre profil est prêt</p>
            <h1 className="paywall-intro__title">
              Parlez anglais avec
              <span className="paywall-intro__accent"> confiance</span>
            </h1>
            <p className="paywall-intro__lede">
              Le tuteur vocal Guengo vous attend — des conversations courtes et
              régulières pour gagner du réflexe, pas des leçons interminables.
            </p>
          </div>

          <section
            className="paywall-card"
            aria-labelledby="paywall-title"
          >
            <div className="paywall-card__top">
              <div className="paywall-card__mark">
                <PaywallVoiceIcon />
              </div>
              <div className="paywall-card__top-copy">
                <span className="paywall-card__badge">Premium</span>
                <h2 id="paywall-title" className="paywall-card__title">
                  Accès complet
                </h2>
              </div>
            </div>

            <div className="paywall-pricing" aria-label="Tarif">
              <div className="paywall-pricing__main">
                <span className="paywall-pricing__amount">{MONTHLY_PRICE_EUR} €</span>
                <div className="paywall-pricing__meta">
                  <span className="paywall-pricing__period">par mois</span>
                  <span className="paywall-pricing__daily">
                    soit ~{dailyPrice} € / jour
                  </span>
                </div>
              </div>
            </div>

            <ul className="paywall-features" aria-label="Inclus dans l’abonnement">
              {PREMIUM_FEATURES.map((feature) => (
                <li key={feature} className="paywall-features__item">
                  <PaywallCheckIcon />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {statusMessage ? (
              <p
                className={`paywall-card__status${activating ? " paywall-card__status--busy" : ""}`}
                role="status"
              >
                {statusMessage}
              </p>
            ) : null}

            <div className="paywall-card__footer">
              <button
                type="button"
                className="btn btn--cta paywall-card__cta"
                disabled={checkoutBusy || activating || !stripePaywallEnabled}
                onClick={() => void handleCheckout()}
              >
                <span>
                  {checkoutBusy
                    ? "Redirection…"
                    : activating
                      ? "Activation…"
                      : "Accéder maintenant"}
                </span>
                {!checkoutBusy && !activating ? (
                  <svg
                    className="paywall-card__cta-arrow"
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    aria-hidden="true"
                  >
                    <path
                      d="M3.5 9h11M10 5.5 13.5 9 10 12.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </button>

              {profileError ? (
                <p className="auth-card__hint paywall-card__error" role="alert">
                  {profileError}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
