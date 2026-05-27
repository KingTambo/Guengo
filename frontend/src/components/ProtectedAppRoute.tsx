import { useEffect, type ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import { navigate } from "../router";

/**
 * Si Supabase est configuré côté API, exige une session pour accéder au tuteur (/app).
 */
export function ProtectedAppRoute({ children }: { children: ReactNode }) {
  const { loading, session, authRequired } = useAuth();

  useEffect(() => {
    if (loading || !authRequired) return;
    if (!session) navigate("/login");
  }, [loading, authRequired, session]);

  if (!authRequired) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="page page--auth-gate" role="status">
        <p className="page--auth-gate__text">Vérification de la session…</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return <>{children}</>;
}
