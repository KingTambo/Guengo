/**
 * Subtitle pipeline logging (browser console).
 * Enable one of:
 * - Append `?subtitleDebug=1` to the page URL (reload)
 * - `localStorage.setItem("GUENGO_SUBTITLE_DEBUG", "1")` then reload
 * Filter console by: guengo:subtitles
 */
export function subtitleDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      new URLSearchParams(window.location.search).get("subtitleDebug") === "1" ||
      localStorage.getItem("GUENGO_SUBTITLE_DEBUG") === "1"
    );
  } catch {
    return false;
  }
}

export function logSubtitle(label: string, payload?: unknown): void {
  if (!subtitleDebugEnabled()) return;
  if (payload !== undefined) {
    console.info(`[guengo:subtitles] ${label}`, payload);
  } else {
    console.info(`[guengo:subtitles] ${label}`);
  }
}

export function previewText(s: string, max = 120): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}
