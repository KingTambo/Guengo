import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import { fetchAppConfig, clearAppConfigCache } from "../api/config";
import { ONBOARDING_QUESTIONS } from "../data/onboardingQuestions";
import type { SupabaseClient } from "@supabase/supabase-js";

type ProfileGateRow = {
  onboarding_quiz_completed_at: string | null;
  readiness_completed_at: string | null;
  onboarding_completed_at: string | null;
  is_premium: boolean;
  onboarding_answers: Record<string, string> | null;
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGateProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileGateRow | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "onboarding_quiz_completed_at, readiness_completed_at, onboarding_completed_at, is_premium, onboarding_answers",
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    if (data) {
      const row = data as ProfileGateRow;
      const answers =
        row.onboarding_answers &&
        typeof row.onboarding_answers === "object" &&
        !Array.isArray(row.onboarding_answers)
          ? { ...row.onboarding_answers }
          : {};
      return { ...row, onboarding_answers: answers };
    }
    await sleep(350);
  }
  return null;
}

/**
 * Flux : préférences onboarding → « Êtes-vous prêt… » → (paywall Stripe si configuré).
 * Premium en base ou paywall désactivé côté API → accès direct au tuteur.
 */
export function AppOnboardingGate({ children }: { children: ReactNode }) {
  const { loading: authLoading, session, authRequired, supabase } = useAuth();
  const [bootLoading, setBootLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileGateRow | null>(null);
  const [stripePaywallEnabled, setStripePaywallEnabled] = useState(false);

  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const bootstrap = useCallback(async () => {
    if (!supabase || !session?.user?.id) {
      setBootLoading(false);
      setProfile(null);
      return;
    }
    setProfileError(null);
    setBootLoading(true);
    try {
      const cfg = await fetchAppConfig();
      setStripePaywallEnabled(Boolean(cfg.stripe_paywall_enabled));

      const row = await fetchGateProfile(supabase, session.user.id);
      if (!row) {
        setProfileError(
          "Votre profil n’est pas encore prêt. Réessayez dans un instant.",
        );
        setProfile(null);
        return;
      }

      const answers = row.onboarding_answers ?? {};
      setProfile(row);
      setChoices(Object.keys(answers).length ? answers : {});
    } catch (err) {
      setProfileError(
        err instanceof Error
          ? err.message
          : "Impossible de charger votre profil.",
      );
      setProfile(null);
    } finally {
      setBootLoading(false);
    }
  }, [session?.user?.id, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!authRequired || !session || !supabase) {
      setBootLoading(false);
      setProfile(null);
      return;
    }
    void bootstrap();
  }, [authLoading, authRequired, session, supabase, bootstrap]);

  /** Retour après Stripe Checkout — le webhook peut mettre quelques secondes. */
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

    clearAppConfigCache();
    window.history.replaceState(null, "", window.location.pathname);

    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      void bootstrap();
      if (n >= 12) window.clearInterval(id);
    }, 2200);

    void bootstrap();

    return () => window.clearInterval(id);
  }, [authRequired, session?.user?.id, supabase, bootstrap]);

  async function saveReadiness() {
    if (!supabase || !session?.user?.id) return;
    setSaving(true);
    setProfileError(null);
    try {
      const now = new Date().toISOString();
      const { error: upErr } = await supabase
        .from("profiles")
        .update({
          readiness_completed_at: now,
          onboarding_completed_at: now,
          updated_at: now,
        })
        .eq("id", session.user.id);

      if (upErr) throw upErr;
      await bootstrap();
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "Enregistrement impossible.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function startStripeCheckout() {
    if (!supabase) return;
    setCheckoutBusy(true);
    setProfileError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setProfileError("Session introuvable. Reconnectez-vous.");
        return;
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
        setProfileError(
          resp.status === 503
            ? "Paiement indisponible (configuration Stripe incomplète côté serveur)."
            : `Paiement : erreur HTTP ${resp.status}.`,
        );
        return;
      }
      let parsed: { checkout_url?: string };
      try {
        parsed = JSON.parse(bodyRaw) as { checkout_url?: string };
      } catch {
        setProfileError("Réponse paiement invalide.");
        return;
      }
      if (!parsed.checkout_url) {
        setProfileError("Réponse paiement invalide.");
        return;
      }
      window.location.assign(parsed.checkout_url);
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "Impossible de lancer la caisse.",
      );
    } finally {
      setCheckoutBusy(false);
    }
  }

  if (!authRequired || !session || !supabase) {
    return <>{children}</>;
  }

  if (authLoading || bootLoading) {
    return (
      <div className="page page--auth-gate" role="status">
        <p className="page--auth-gate__text">Chargement…</p>
      </div>
    );
  }

  if (profileError && !profile) {
    return (
      <div className="page page--onboarding">
        <main className="auth-shell">
          <section className="auth-card onboarding-card" aria-live="polite">
            <h1 className="auth-card__title">Onboarding</h1>
            <p className="auth-card__hint" role="alert">
              {profileError}
            </p>
            <button
              type="button"
              className="btn btn--cta auth-form__submit"
              onClick={() => void bootstrap()}
            >
              Réessayer
            </button>
          </section>
        </main>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  if (profile.is_premium) {
    return <>{children}</>;
  }

  const quizDone = Boolean(profile.onboarding_quiz_completed_at);
  const readinessDone = Boolean(profile.readiness_completed_at);

  if (!quizDone) {
    const q = ONBOARDING_QUESTIONS[step];
    const total = ONBOARDING_QUESTIONS.length;
    const selected = choices[q.id] ?? "";
    const isLast = step === total - 1;

    return (
      <div className="page page--onboarding">
        <main className="auth-shell">
          <section
            className="auth-card onboarding-card"
            aria-labelledby="onboarding-title"
          >
            <p className="onboarding-card__progress">
              Question {step + 1} sur {total}
            </p>
            <h1 id="onboarding-title" className="auth-card__title">
              Personnaliser vos conversations
            </h1>
            <p className="auth-card__subtitle">{q.prompt}</p>

            <div
              className="onboarding-options"
              role="radiogroup"
              aria-labelledby="onboarding-title"
            >
              {q.options.map((opt) => {
                const id = `onb-${q.id}-${opt.value}`;
                return (
                  <label
                    key={opt.value}
                    className="onboarding-option"
                    htmlFor={id}
                  >
                    <input
                      id={id}
                      type="radio"
                      name={q.id}
                      value={opt.value}
                      checked={selected === opt.value}
                      onChange={() =>
                        setChoices((prev) => ({ ...prev, [q.id]: opt.value }))
                      }
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>

            <div className="onboarding-card__actions">
              {step > 0 ? (
                <button
                  type="button"
                  className="btn btn--ghost onboarding-card__back"
                  disabled={saving}
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                >
                  Retour
                </button>
              ) : (
                <span className="onboarding-card__back-spacer" aria-hidden />
              )}
              <button
                type="button"
                className="btn btn--cta onboarding-card__next"
                disabled={!selected || saving}
                onClick={() => {
                  if (!selected || !session?.user?.id) return;
                  if (!isLast) {
                    setStep((s) => s + 1);
                    return;
                  }
                  setSaving(true);
                  setProfileError(null);
                  void (async () => {
                    try {
                      const answers: Record<string, string> = {};
                      for (const item of ONBOARDING_QUESTIONS) {
                        const v = choices[item.id];
                        if (v) answers[item.id] = v;
                      }
                      answers[q.id] = selected;

                      const quizAt = new Date().toISOString();
                      const { error: upErr } = await supabase
                        .from("profiles")
                        .update({
                          onboarding_quiz_completed_at: quizAt,
                          onboarding_answers: answers,
                          updated_at: quizAt,
                        })
                        .eq("id", session.user.id);

                      if (upErr) throw upErr;
                      await bootstrap();
                    } catch (err) {
                      setProfileError(
                        err instanceof Error
                          ? err.message
                          : "Enregistrement impossible. Réessayez.",
                      );
                    } finally {
                      setSaving(false);
                    }
                  })();
                }}
              >
                {saving ? "Enregistrement…" : "Suivant"}
              </button>
            </div>
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

  if (!readinessDone) {
    return (
      <div className="page page--onboarding">
        <main className="auth-shell">
          <section
            className="auth-card onboarding-card onboarding-ready"
            aria-labelledby="ready-title"
          >
            <h1 id="ready-title" className="auth-card__title">
              Êtes-vous prêt à améliorer votre anglais&nbsp;?
            </h1>
            <p className="auth-card__subtitle onboarding-ready__lede">
              Vous allez passer au tuteur vocal Guengo&nbsp;: des conversations
              courtes, régulières, pour gagner du réflexe avant tout.
            </p>
            <button
              type="button"
              className="btn btn--cta auth-form__submit"
              disabled={saving}
              onClick={() => void saveReadiness()}
            >
              {saving ? "En cours…" : "Commencer"}
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

  if (stripePaywallEnabled) {
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
              Un abonnement actif via Stripe débloque les sessions vocales
              illimitées. Après paiement vous revenez ici automatiquement.
            </p>
            <button
              type="button"
              className="btn btn--cta auth-form__submit"
              disabled={checkoutBusy}
              onClick={() => void startStripeCheckout()}
            >
              {checkoutBusy ? "Redirection…" : "S’abonner avec Stripe"}
            </button>
            <button
              type="button"
              className="btn btn--ghost auth-form__submit paywall-card__refresh"
              disabled={checkoutBusy}
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

  return <>{children}</>;
}
