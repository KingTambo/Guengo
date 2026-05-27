import { deploymentOrigin } from "./env";
import { usesCachedOpening, welcomeForTopic } from "./tutor";

type OpeningCaptions = { english: string; french?: string | null };

async function fetchStatic(relativePath: string): Promise<Response | null> {
  const base = deploymentOrigin();
  try {
    const res = await fetch(`${base}${relativePath}`);
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

export async function openingDisplayCaptions(
  topicId: string,
): Promise<OpeningCaptions> {
  const jsonPath = `/audio/openings/${encodeURIComponent(topicId)}.opening.json`;
  const res = await fetchStatic(jsonPath);
  if (res) {
    const dto = (await res.json()) as {
      english?: string;
      french?: string;
    };
    const english = dto.english?.trim();
    if (english) {
      const french = dto.french?.trim() || undefined;
      return { english, french: french ?? null };
    }
  }
  const welcome = welcomeForTopic(topicId);
  return { english: welcome, french: null };
}

export async function openingAudioBase64(topicId: string): Promise<string | null> {
  if (!usesCachedOpening(topicId)) return null;
  const pcmPath = `/audio/openings/${encodeURIComponent(topicId)}.pcm`;
  const res = await fetchStatic(pcmPath);
  if (!res) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) return null;
  return buf.toString("base64");
}
