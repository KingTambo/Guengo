export type DisplayParts = {
  english: string;
  french: string | null;
};

const ACCENT_RE = /[àâäéèêëïîôùûüçœæ]/i;

/** Split tutor reply into spoken English and optional French subtitle. */
export function splitDisplayParts(text: string): DisplayParts {
  const frenchBlocks: string[] = [];
  let rest = text;

  rest = rest.replace(/\*([^*]+)\*/g, (_match, block: string) => {
    const cleaned = block.trim();
    if (cleaned) frenchBlocks.push(cleaned);
    return " ";
  });

  const englishParts: string[] = [];
  // Include newlines — Live transcripts often omit final punctuation mid-stream.
  for (const sentence of rest.split(/(?<=[.!?\n])\s+/)) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (!looksFrench(trimmed)) {
      englishParts.push(trimmed);
    } else {
      frenchBlocks.push(trimmed);
    }
  }

  let englishCombined = englishParts.join(" ").trim();

  // One long EN+FR line without sentence breaks: salvage leading English before the first accent.
  if (!englishCombined && rest.trim()) {
    const trimmed = rest.replace(/\s+/g, " ").trim();
    const idx = trimmed.search(ACCENT_RE);
    if (idx > 3) {
      englishCombined = trimmed.slice(0, idx).trim();
      const tail = trimmed.slice(idx).trim();
      if (tail) frenchBlocks.push(tail);
    } else {
      englishCombined = trimmed;
    }
  }

  const frenchCombined =
    frenchBlocks.length > 0 ? frenchBlocks.join(" ").trim() : null;

  return {
    english: englishCombined,
    french: frenchCombined,
  };
}

/** Heuristic — Roman-script French often lacks accents in ASR; shared with `splitDisplayParts`. */
export function hasFrenchOrthographyHints(text: string): boolean {
  return ACCENT_RE.test(text);
}

function looksFrench(text: string): boolean {
  return hasFrenchOrthographyHints(text);
}
