import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import { fetchAppConfig } from "../api/config";
import { ONBOARDING_QUESTIONS } from "../data/onboardingQuestions";
import { fetchGateProfile, type ProfileGateRow } from "../lib/profileGate";
import { navigateReplace } from "../router";

/**
 * Flux : questionnaire → « Êtes-vous prêt… » → /paywall si non premium.
 * Premium en base → accès direct au tuteur (/app).
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

      const cfg = await fetchAppConfig();
      if (cfg.stripe_paywall_enabled) {
        navigateReplace("/paywall");
        return;
      }
      await bootstrap();
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "Enregistrement impossible.",
      );
    } finally {
      setSaving(false);
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

  if (quizDone && readinessDone && stripePaywallEnabled) {
    navigateReplace("/paywall");
    return (
      <div className="page page--auth-gate" role="status">
        <p className="page--auth-gate__text">Redirection…</p>
      </div>
    );
  }

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

  return <>{children}</>;
}
