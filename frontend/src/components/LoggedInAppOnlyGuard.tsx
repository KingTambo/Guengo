import { useEffect } from "react";
import { useAuth } from "../auth/AuthProvider";
import { navigateReplace, usePathname } from "../router";

function pathIsAllowedWhenAuthed(pathname: string): boolean {
  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/paywall" ||
    pathname.startsWith("/paywall/")
  );
}

/**
 * Avec Supabase activé et une session : seul `/app` est autorisé (plus d’accueil /
 * login / signup / autres URLs SPA).
 */
export function LoggedInAppOnlyGuard() {
  const pathname = usePathname();
  const { loading, session, authRequired } = useAuth();

  useEffect(() => {
    if (loading || !authRequired || !session) return;
    if (!pathIsAllowedWhenAuthed(pathname)) {
      navigateReplace("/app");
    }
  }, [pathname, loading, session, authRequired]);

  return null;
}
