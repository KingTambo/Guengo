import { AuthProvider } from "./auth/AuthProvider";
import { LoginPage } from "./pages/auth/login/LoginPage";
import { SignupPage } from "./pages/auth/signup/SignupPage";
import { ProtectedAppRoute } from "./components/ProtectedAppRoute";
import { AppOnboardingGate } from "./components/AppOnboardingGate";
import { LoggedInAppOnlyGuard } from "./components/LoggedInAppOnlyGuard";
import { AppPage } from "./pages/AppPage";
import { PaywallPage } from "./pages/PaywallPage";
import { LandingPage } from "./pages/LandingPage";
import { usePathname } from "./router";

export function App() {
  return (
    <AuthProvider>
      <LoggedInAppOnlyGuard />
      <AppRouter />
    </AuthProvider>
  );
}

function AppRouter() {
  const pathname = usePathname();

  if (pathname === "/app" || pathname.startsWith("/app/")) {
    return (
      <ProtectedAppRoute>
        <AppOnboardingGate>
          <AppPage />
        </AppOnboardingGate>
      </ProtectedAppRoute>
    );
  }

  if (pathname === "/paywall" || pathname.startsWith("/paywall/")) {
    return (
      <ProtectedAppRoute>
        <PaywallPage />
      </ProtectedAppRoute>
    );
  }

  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return <LoginPage />;
  }

  if (pathname === "/signup" || pathname.startsWith("/signup/")) {
    return <SignupPage />;
  }

  return <LandingPage />;
}
