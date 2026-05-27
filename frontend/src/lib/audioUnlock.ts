/** Unlock browser audio playback (required after async gaps before PCM / Gemini output). */
let unlocked = false;

const SILENT_MP3 =
  "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+1DEAAAHAAGf9AAAIAAANIAAAAQAAAaAAAAMAAANIAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7UMQbAA8AAAfQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==";

/** Wait until a silent unlock play succeeds (needs a recent user gesture on first visit). */
export async function ensureAudioPlaybackUnlocked(): Promise<boolean> {
  if (unlocked) return true;
  const audio = new Audio(SILENT_MP3);
  audio.volume = 0.01;
  try {
    await audio.play();
    unlocked = true;
    return true;
  } catch {
    return false;
  }
}

/** Fire-and-forget unlock (legacy); prefer awaiting `ensureAudioPlaybackUnlocked()` before PCM. */
export function unlockAudioPlayback(): void {
  void ensureAudioPlaybackUnlocked();
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}
