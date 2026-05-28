export type DisplayParts = {
  english: string;
  french: string | null;
};

const ACCENT_RE = /[àâäéèêëïîôùûüçœæ]/i;

const FRENCH_MARKERS = new Set([
  "je", "tu", "vous", "nous", "le", "la", "les", "un", "une", "des", "du", "de", "et", "est",
  "pas", "que", "pour", "avec", "comment", "bonjour", "merci", "français", "francais", "ça",
  "ca", "très", "tres", "oui", "non", "peut", "être", "etre", "dire", "parler", "aide",
  "veux", "peux", "prêt", "pret", "répète", "repète", "repete", "essaye", "essayez", "dis",
  "moi", "aussi", "mais", "donc", "alors", "voilà", "voila", "chez", "sur", "dans", "qui",
  "où", "aux", "cela", "cette", "mon", "ton", "son", "notre", "votre", "leur", "ici", "là",
  "commence", "appelles", "appelle", "si", "en", "au", "tes", "mes", "ses", "ces",
  "tout", "tous", "toute", "toutes", "plus", "encore", "bien", "mal", "parle", "parles",
  "quoi", "quand", "pourquoi", "parce", "comme", "sans", "sous", "entre", "vers", "depuis",
  "avant", "après", "apres", "maintenant", "c'est", "j'ai", "n'est", "d'accord",
]);

const ENGLISH_MARKERS = new Set([
  "the", "and", "you", "your", "hello", "hi", "english", "try", "say", "speak", "repeat",
  "good", "nice", "meet", "name", "what", "how", "where", "when", "why", "can", "could",
  "would", "should", "let", "lets", "ready", "start", "practice", "word", "sentence",
  "topic", "talk", "about", "pick", "choose", "tell", "ask", "answer", "great", "well",
  "done", "perfect", "again", "sound", "pronunciation", "means", "like", "want", "need",
  "help", "learn", "teacher", "tutor", "student", "only", "imagine", "from", "this", "that",
  "with", "have", "has", "had", "was", "were", "are", "is", "am", "be", "been", "being",
  "will", "just", "very", "really", "please", "thanks", "thank", "right", "wrong", "correct",
]);

const FRENCH_PHRASES = [
  "en français",
  "en francais",
  "dis-le",
  "dis le",
  "si tu",
  "si vous",
  "c est",
  "c'est",
  "d accord",
  "d'accord",
  "n est",
  "n'est",
  "j ai",
  "j'ai",
  "l anglais",
  "l'anglais",
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zàâäéèêëïîôùûüçœæ']+/i)
    .filter((word) => word.length > 1);
}

/** Score how French vs English a line reads (positive = more French). */
export function subtitleLangScore(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  let french = 0;
  let english = 0;

  if (ACCENT_RE.test(trimmed)) french += 4;

  for (const word of tokenize(trimmed)) {
    if (FRENCH_MARKERS.has(word)) french += 1;
    if (ENGLISH_MARKERS.has(word)) english += 1;
  }

  const lower = trimmed.toLowerCase();
  for (const phrase of FRENCH_PHRASES) {
    if (lower.includes(phrase)) french += 2;
  }

  return french - english;
}

export function isLikelyFrench(text: string): boolean {
  return subtitleLangScore(text) > 0;
}

export function isLikelyEnglish(text: string): boolean {
  return subtitleLangScore(text) < 0;
}

/** Keep black = English, blue = French — swap when the caption LLM inverts them. */
export function normalizeSubtitlePair(
  english: string,
  french: string | null,
): DisplayParts {
  const en = english.trim();
  const fr = french?.trim() || null;

  if (!fr) {
    if (en && isLikelyFrench(en)) {
      return { english: "", french: en };
    }
    return { english: en, french: null };
  }

  const enScore = subtitleLangScore(en);
  const frScore = subtitleLangScore(fr);

  if (enScore > frScore + 1) {
    return { english: fr, french: en };
  }

  return { english: en, french: fr };
}

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
    if (!isLikelyFrench(trimmed)) {
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
    } else if (!isLikelyFrench(trimmed)) {
      englishCombined = trimmed;
    } else {
      frenchBlocks.push(trimmed);
    }
  }

  const frenchCombined =
    frenchBlocks.length > 0 ? frenchBlocks.join(" ").trim() : null;

  return normalizeSubtitlePair(englishCombined, frenchCombined);
}

/** Merge Live audio transcript + model text into EN (top) / FR (bottom) caption parts. */
export function mergeStreamingCaptionParts(
  transcript: string,
  modelText: string,
): DisplayParts {
  const trans = splitDisplayParts(transcript);
  const model = splitDisplayParts(modelText);

  let english = trans.english.trim() || model.english.trim();
  let french = trans.french?.trim() || model.french?.trim() || null;

  const rawTrans = transcript.trim();
  const rawModel = modelText.trim();

  if (!english) {
    if (rawTrans && !isLikelyFrench(rawTrans)) english = rawTrans;
    else if (rawModel && !isLikelyFrench(rawModel)) english = rawModel;
  }
  if (!french) {
    if (rawTrans && isLikelyFrench(rawTrans)) french = rawTrans;
    else if (rawModel && isLikelyFrench(rawModel)) french = rawModel;
  }

  return normalizeSubtitlePair(english.trim(), french?.trim() || null);
}

/** Heuristic — Roman-script French often lacks accents in ASR; shared with `splitDisplayParts`. */
export function hasFrenchOrthographyHints(text: string): boolean {
  return ACCENT_RE.test(text) || isLikelyFrench(text);
}
