import { type FormEvent, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider";
import { navigateReplace, onNavigate } from "../../../router";
import { GoogleAuthButton } from "../GoogleAuthButton";

export function SignupPage() {
  const { supabase, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canSubmitEmail = Boolean(supabase) && !loading;

  return (
    <div className="page">
      <header className="nav">
        <a
          href="/"
          className="nav__brand"
          onClick={(event) => onNavigate("/", event)}
        >
          Guengo
        </a>
        <div className="nav__actions">
          <a
            href="/login"
            className="btn btn--ghost"
            onClick={(event) => onNavigate("/login", event)}
          >
            Se connecter
          </a>
        </div>
      </header>

      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="signup-title">
          <h1 id="signup-title" className="auth-card__title">
            S&apos;inscrire
          </h1>
          <p className="auth-card__subtitle">
            Créez un compte pour suivre votre progression.
          </p>
          <form
            className="auth-form"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              if (!supabase) return;
              const form = event.currentTarget;
              const email = String(
                (form.elements.namedItem("email") as HTMLInputElement).value,
              );
              const password = String(
                (form.elements.namedItem("password") as HTMLInputElement)
                  .value,
              );
              setError(null);
              setInfo(null);
              setBusy(true);
              void (async () => {
                try {
                  const origin = window.location.origin;
                  const { data, error: signErr } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { emailRedirectTo: `${origin}/app` },
                  });
                  if (signErr) throw signErr;
                  if (data.session) {
                    navigateReplace("/app");
                  } else {
                    setInfo(
                      "Un e-mail de confirmation peut être requis avant la première connexion.",
                    );
                  }
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Inscription impossible.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <div className="auth-field">
              <label htmlFor="signup-email">E-mail</label>
              <input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={!canSubmitEmail}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="signup-password">Mot de passe</label>
              <input
                id="signup-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                disabled={!canSubmitEmail}
              />
            </div>
            {error ? (
              <p className="auth-card__hint" role="alert">
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="auth-card__hint auth-card__hint--info" role="status">
                {info}
              </p>
            ) : null}
            {!canSubmitEmail && !loading ? (
              <p className="auth-card__hint" role="note">
                Configurez SUPABASE_URL et SUPABASE_ANON_KEY sur l&apos;API pour
                l&apos;inscription e-mail.
              </p>
            ) : null}
            <button
              type="submit"
              className="btn btn--cta auth-form__submit"
              disabled={!canSubmitEmail || busy}
            >
              {busy ? "Inscription…" : "Créer mon compte"}
            </button>
          </form>
          <GoogleAuthButton />
          <p className="auth-card__footer">
            Déjà un compte&nbsp;?{" "}
            <a
              href="/login"
              className="auth-card__link"
              onClick={(event) => onNavigate("/login", event)}
            >
              Se connecter
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
