import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { signOutAndGoToLogin } from "../lib/authSignOut";

function ProfileIcon() {
  return (
    <svg
      className="btn-user-menu__icon"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M6 19.5v-.5a4.5 4.5 0 0 1 4.5-4.5h3a4.5 4.5 0 0 1 4.5 4.5v.5" />
    </svg>
  );
}

type UserMenuDropdownProps = {
  /** Classes du bouton (ex. `app-header__profile`) */
  triggerClassName?: string;
};

export function UserMenuDropdown({
  triggerClassName = "app-header__profile",
}: UserMenuDropdownProps) {
  const { supabase, session } = useAuth();
  const email =
    session?.user.email ??
    session?.user.user_metadata?.email ??
    "";

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={wrapRef}>
      <button
        type="button"
        className={triggerClassName}
        aria-label="Menu compte"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <ProfileIcon />
      </button>
      {open ? (
        <div
          className="user-menu__panel"
          aria-labelledby="user-menu-email-label"
        >
          <p id="user-menu-email-label" className="user-menu__email" title={email || undefined}>
            {email || "Session active"}
          </p>
          <button
            type="button"
            className="user-menu__item user-menu__item--danger"
            onClick={() => {
              setOpen(false);
              void signOutAndGoToLogin(supabase);
            }}
          >
            Se déconnecter
          </button>
        </div>
      ) : null}
    </div>
  );
}
