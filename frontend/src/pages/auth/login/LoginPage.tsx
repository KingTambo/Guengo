import { type FormEvent, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider";
import { navigateAfterAuth } from "../../../lib/authRouting";
import { onNavigate } from "../../../router";
import { GoogleAuthButton } from "../GoogleAuthButton";

export function LoginPage() {
  const { supabase, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            href="/signup"
            className="btn btn--primary"
            onClick={(event) => onNavigate("/signup", event)}
          >
            S&apos;inscrire
          </a>
        </div>
      </header>

      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="login-title">
          <h1 id="login-title" className="auth-card__title">
            Se connecter
          </h1>
          <p className="auth-card__subtitle">
            Accédez à votre espace pour continuer vos conversations.
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
              setBusy(true);
              void (async () => {
                try {
                  const { error: signErr } =
                    await supabase.auth.signInWithPassword({
                      email,
                      password,
                    });
                  if (signErr) throw signErr;
                  const {
                    data: { user },
                  } = await supabase.auth.getUser();
                  if (user?.id) {
                    await navigateAfterAuth(supabase, user.id);
                  }
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Identifiants incorrects ou compte introuvable.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <div className="auth-field">
              <label htmlFor="login-email">E-mail</label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={!canSubmitEmail}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="login-password">Mot de passe</label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={!canSubmitEmail}
              />
            </div>
            {error ? (
              <p className="auth-card__hint" role="alert">
                {error}
              </p>
            ) : null}
            {!canSubmitEmail && !loading ? (
              <p className="auth-card__hint" role="note">
                Configurez SUPABASE_URL et SUPABASE_ANON_KEY sur l&apos;API pour
                la connexion e-mail.
              </p>
            ) : null}
            <button
              type="submit"
              className="btn btn--cta auth-form__submit"
              disabled={!canSubmitEmail || busy}
            >
              {busy ? "Connexion…" : "Connexion"}
            </button>
          </form>
          <GoogleAuthButton />
          <p className="auth-card__footer">
            Pas encore de compte&nbsp;?{" "}
            <a
              href="/signup"
              className="auth-card__link"
              onClick={(event) => onNavigate("/signup", event)}
            >
              S&apos;inscrire
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
