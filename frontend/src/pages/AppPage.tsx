import { useEffect, useState } from "react";
import { SessionChat } from "../components/SessionChat";
import { UserMenuDropdown } from "../components/UserMenuDropdown";
import { fetchAppConfig, type AppConfig } from "../api/config";
import { CONVERSATION } from "../data/curriculum";
import { ensureAudioPlaybackUnlocked } from "../lib/audioUnlock";
import { onNavigate } from "../router";

export function AppPage() {
  const [isLive, setIsLive] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    void fetchAppConfig()
      .then((config) => setAppConfig(config))
      .finally(() => setConfigReady(true));
  }, []);

  const liveReady = Boolean(appConfig?.gemini_live);
  const showHeader = !isLive;

  return (
    <div className="page page--app">
      <div className={isLive ? "app-layout app-layout--live" : "app-layout"}>
        {showHeader ? (
          <header className="app-header">
            <a
              href="/app"
              className="app-header__brand"
              onClick={(event) => onNavigate("/app", event)}
            >
              Guengo
            </a>
            <UserMenuDropdown />
          </header>
        ) : null}

        {isLive ? (
          <SessionChat topic={CONVERSATION} onExit={() => setIsLive(false)} />
        ) : (
          <div className="app-layout__shell">
            <section
              className="app-session-full"
              aria-labelledby="app-session-title"
            >
              <div className="app-session-full__content">
                <h1
                  id="app-session-title"
                  className="app-session-full__title"
                >
                  Tuteur Guengo
                </h1>
                <div className="app-session-full__taglines">
                  <p lang="en" className="app-session-full__tagline">
                    Ready to learn English?
                  </p>
                  <p lang="fr" className="app-session-full__tagline-fr">
                    Prêt à apprendre l&apos;anglais&nbsp;?
                  </p>
                </div>

                {!configReady || !liveReady ? (
                  <p className="app-session-full__description">
                    {!configReady
                      ? "Chargement…"
                      : "Ajoutez GEMINI_API_KEY dans .env pour activer les sessions vocales."}
                  </p>
                ) : null}

                <button
                  type="button"
                  className="btn btn--cta app-session-full__cta"
                  disabled={!configReady || !liveReady}
                  onClick={() => {
                    void (async () => {
                      await ensureAudioPlaybackUnlocked();
                      setIsLive(true);
                    })();
                  }}
                >
                  {!configReady
                    ? "Chargement…"
                    : liveReady
                      ? "Démarrer la session vocale"
                      : "GEMINI_API_KEY requise"}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
