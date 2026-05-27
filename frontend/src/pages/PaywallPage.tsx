import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { fetchAppConfig, clearAppConfigCache } from "../api/config";
import { fetchGateProfile } from "../lib/profileGate";
import { startStripeCheckout } from "../lib/stripeCheckout";
import { navigateReplace } from "../router";

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

      if (!row.onboarding_quiz_completed_at) {
        navigateReplace("/app");
        return;
      }

      if (!paywallOn) {
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
      <div className="page page--auth-gate" role="status">
        <p className="page--auth-gate__text">Chargement…</p>
      </div>
    );
  }

  if (!stripePaywallEnabled) {
    return null;
  }

  return (
    <div className="page page--onboarding page--paywall">
      <main className="auth-shell">
        <section
          className="auth-card paywall-card"
          aria-labelledby="paywall-title"
        >
          <h1 id="paywall-title" className="auth-card__title">
            Accès premium
          </h1>
          <p className="auth-card__subtitle">
            {activating
              ? "Paiement reçu — activation de votre accès en cours…"
              : "Un abonnement actif débloque les sessions vocales illimitées avec le tuteur Guengo."}
          </p>
          <button
            type="button"
            className="btn btn--cta auth-form__submit"
            disabled={checkoutBusy || activating}
            onClick={() => void handleCheckout()}
          >
            {checkoutBusy
              ? "Redirection…"
              : activating
                ? "Activation…"
                : "S’abonner avec Stripe"}
          </button>
          <button
            type="button"
            className="btn btn--ghost auth-form__submit paywall-card__refresh"
            disabled={checkoutBusy || activating}
            onClick={() => void bootstrap()}
          >
            J’ai déjà payé — actualiser
          </button>
          {profileError ? (
            <p className="auth-card__hint" role="alert">
              {profileError}
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
