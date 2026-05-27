import { useSyncExternalStore, type MouseEvent } from "react";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function getPathname() {
  return window.location.pathname;
}

export function usePathname() {
  return useSyncExternalStore(subscribe, getPathname, () => "/");
}

export function navigate(path: string) {
  if (path === getPathname()) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Comme navigate, mais sans empiler une entrée d’historique (évite Retour vers login après connexion). */
export function navigateReplace(path: string) {
  if (path === getPathname()) return;
  window.history.replaceState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function onNavigate(
  path: string,
  event: MouseEvent<HTMLAnchorElement>,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  event.preventDefault();
  navigate(path);
}
