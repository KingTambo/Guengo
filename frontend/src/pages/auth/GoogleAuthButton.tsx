import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { signInWithGoogle } from "../../lib/googleAuth";

function GoogleIcon() {
  return (
    <svg
      className="btn-google__icon"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706c-.18-.54-.282-1.117-.282-1.706s.102-1.166.282-1.706V4.962H.957C.347 6.174 0 7.549 0 9s.348 2.825.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.440 1.345l2.582-2.582C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 7.294C4.672 5.164 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export function GoogleAuthButton() {
  const { supabase, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canUseGoogle = Boolean(supabase) && !loading;

  return (
    <>
      <div className="auth-divider" role="presentation">
        <span>ou</span>
      </div>
      <button
        type="button"
        className="btn btn--google"
        disabled={busy || !canUseGoogle}
        onClick={() => {
          if (!supabase) return;
          setMessage(null);
          setBusy(true);
          void (async () => {
            try {
              await signInWithGoogle(supabase);
            } catch (err) {
              const text =
                err instanceof Error ? err.message : "Connexion impossible.";
              setMessage(text);
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <GoogleIcon />
        {busy ? "Redirection…" : "Continuer avec Google"}
      </button>
      {!canUseGoogle && !loading ? (
        <p className="auth-card__hint" role="note">
          Ajoutez SUPABASE_URL et SUPABASE_ANON_KEY côté serveur pour activer
          Google.
        </p>
      ) : null}
      {message ? (
        <p className="auth-card__hint" role="alert">
          {message}
        </p>
      ) : null}
    </>
  );
}
