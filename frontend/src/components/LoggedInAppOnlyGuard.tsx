import { useEffect } from "react";
import { useAuth } from "../auth/AuthProvider";
import { navigateAfterAuth } from "../lib/authRouting";
import { usePathname } from "../router";

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
  const { loading, session, authRequired, supabase } = useAuth();

  useEffect(() => {
    if (loading || !authRequired || !session || !supabase) return;
    if (!pathIsAllowedWhenAuthed(pathname)) {
      void navigateAfterAuth(supabase, session.user.id);
    }
  }, [pathname, loading, session, authRequired, supabase]);

  return null;
}
