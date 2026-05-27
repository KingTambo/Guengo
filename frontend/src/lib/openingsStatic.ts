/**
 * Bundled intros live under `frontend/public/audio/openings/` and are served as static files
 * (same origin as the SPA). This avoids depending on `/api/live/opening-audio` when only the Rust
 * API routes misbehave — `GET …/opening-audio` and session-shell remain fallbacks.
 */
export function openingPcmPublicUrl(topicId: string): string {
  return `/audio/openings/${encodeURIComponent(topicId)}.pcm`;
}

export function openingJsonPublicUrl(topicId: string): string {
  return `/audio/openings/${encodeURIComponent(topicId)}.opening.json`;
}

export type OpeningCaptionJson = {
  english: string;
  french: string | null;
};

/** Load optional EN/FR sidecar committed next to `.pcm`; returns null if missing or invalid. */
export async function loadOpeningCaptionsStatic(
  topicId: string,
): Promise<OpeningCaptionJson | null> {
  try {
    const res = await fetch(openingJsonPublicUrl(topicId), {
      credentials: "same-origin",
      cache: "no-cache",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { english?: string; french?: string };
    const english = typeof data.english === "string" ? data.english.trim() : "";
    if (!english) return null;
    const fr =
      typeof data.french === "string" && data.french.trim().length > 0
        ? data.french.trim()
        : null;
    return { english, french: fr };
  } catch {
    return null;
  }
}

/** Raw 24 kHz mono little-endian PCM bytes; null if not found. */
export async function loadOpeningPcmStatic(
  topicId: string,
): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(openingPcmPublicUrl(topicId), {
      credentials: "same-origin",
      cache: "no-cache",
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength >= 2 ? buf : null;
  } catch {
    return null;
  }
}
