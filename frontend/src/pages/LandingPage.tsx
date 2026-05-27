import { onNavigate } from "../router";

export function LandingPage() {
  return (
    <div className="page">
      <header className="nav">
        <a href="/" className="nav__brand">
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
          <a
            href="/signup"
            className="btn btn--primary"
            onClick={(event) => onNavigate("/signup", event)}
          >
            S&apos;inscrire
          </a>
        </div>
      </header>

      <main className="hero">
        <div className="hero__glow" aria-hidden="true" />
        <div className="hero__content">
          <p className="hero__eyebrow">
            De vraies conversations. Une vraie aisance en anglais.
          </p>
          <h1 className="hero__title">
            Apprenez l&apos;anglais grâce aux
            <span className="hero__title-accent"> conversations en direct</span>
          </h1>
          <p className="hero__subtitle">
            Guengo est votre tuteur d&apos;anglais pour francophones — parlez en
            français ou en anglais, demandez « English only » quand vous voulez
            vous challenger, et progressez en temps réel.
          </p>
          <a
            href="/login"
            className="btn btn--cta"
            onClick={(event) => onNavigate("/login", event)}
          >
            Commencer
          </a>
        </div>
      </main>
    </div>
  );
}
