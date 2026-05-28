import { env } from "./env";

export const GEMINI_LIVE_MODEL =
  "gemini-2.5-flash-native-audio-preview-12-2025";

const CAPTION_SYSTEM = `Guengo live tutor — on-screen captions only.
You receive rough transcripts/snippets from Gemini Live. The tutor may speak English or French aloud.
On-screen layout is fixed: "english" = British English (top/black), "french" = Parisian French (bottom/blue).
When raw is French speech transcription, put the spoken Parisian French line in french and the British English teaching equivalent in english — never swap them.
When raw is English speech, derive one clean English subtitle; french must translate THAT English line only.
Never put Spanish, Portuguese, Mandarin, Hindi, Arabic, German, Korean, or any third language into either field.
Return JSON matching the schema: both "english" and "french" are required strings.`;

const TRANSLATE_SUBTITLE_SYSTEM =
  "Guengo subtitle translator. Output JSON only. Parisian French, brief, same teaching tone as the English line.";

const TRANSLATE_FR_TO_EN_SYSTEM =
  "Guengo subtitle translator. Output JSON only. British English, brief, same teaching tone as the French tutor line.";

export function geminiLiveReady(): boolean {
  return Boolean(env("GEMINI_API_KEY"));
}

export function geminiLiveModel(): string {
  return env("GEMINI_LIVE_MODEL") ?? GEMINI_LIVE_MODEL;
}

function captionModel(): string {
  return env("GEMINI_CAPTION_MODEL") ?? "gemini-2.5-flash";
}

export async function geminiLiveAuth(): Promise<
  { token: string; model: string } | null
> {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) return null;

  const model = geminiLiveModel();
  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 2 * 60 * 1000).toISOString();

  const url = `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expireTime,
      newSessionExpireTime,
      uses: 1,
      bidiGenerateContentSetup: {
        model: `models/${model}`,
        generationConfig: { responseModalities: ["AUDIO"] },
        outputAudioTranscription: {},
      },
    }),
  });

  if (!response.ok) return null;
  const parsed = (await response.json()) as { name?: string };
  const token = parsed.name?.trim();
  if (!token) return null;
  return { token, model };
}

type SubtitleLines = { english: string; french?: string | null };

const ACCENT_RE = /[àâäéèêëïîôùûüçœæ]/i;
const FR_WORDS =
  /\b(je|tu|vous|nous|le|la|les|un|une|des|du|de|est|pas|que|pour|avec|comment|bonjour|merci|oui|non|très|bien|c'est|d'accord)\b/i;
const EN_WORDS =
  /\b(the|and|you|your|hello|what|how|try|say|speak|good|nice|can|could|would|this|that|with|have|has|is|are|was|were)\b/i;

function subtitleLangScore(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  let score = 0;
  if (ACCENT_RE.test(t)) score += 4;
  const fr = t.match(new RegExp(FR_WORDS.source, "gi"))?.length ?? 0;
  const en = t.match(new RegExp(EN_WORDS.source, "gi"))?.length ?? 0;
  return score + fr - en;
}

function isLikelyFrench(text: string): boolean {
  return subtitleLangScore(text) > 0;
}

function normalizeSubtitleLines(
  english: string,
  french?: string | null,
): SubtitleLines {
  const en = english.trim();
  const fr = french?.trim() || null;
  if (!fr) {
    if (en && isLikelyFrench(en)) return { english: "", french: en };
    return { english: en, french: null };
  }
  if (subtitleLangScore(en) > subtitleLangScore(fr) + 1) {
    return { english: fr, french: en };
  }
  return { english: en, french: fr };
}

function parseJsonBlob<T>(blob: string): T | null {
  const t = blob.trim();
  try {
    return JSON.parse(t) as T;
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function generateContent(
  userPrompt: string,
  system: string,
  schema: Record<string, unknown> | null,
  maxTokens: number,
  temperature: number,
): Promise<string | null> {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) return null;
  const model = captionModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
      ...(schema ? { responseSchema: schema } : {}),
    },
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        attempt === 1
          ? {
              ...body,
              generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
                responseMimeType: "application/json",
              },
            }
          : body,
      ),
    });
    if (!response.ok) continue;
    const parsed = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text = parsed.candidates
      ?.flatMap((c) => c.content?.parts ?? [])
      .find((p) => p.text)?.text;
    if (text) return text;
  }
  return null;
}

async function translateEnToFr(english: string): Promise<string | undefined> {
  const userPrompt = `Return JSON { "french": "…" }. Translate this English subtitle into natural Parisian French for subtitles. Preserve brevity and teaching tone.\n\nEnglish:\n${english}`;
  const schema = {
    type: "object",
    properties: {
      french: { type: "string", description: "Parisian French translation." },
    },
    required: ["french"],
  };
  const text = await generateContent(
    userPrompt,
    TRANSLATE_SUBTITLE_SYSTEM,
    schema,
    256,
    0.2,
  );
  if (!text) return undefined;
  const parsed = parseJsonBlob<{ french?: string }>(text);
  const french = parsed?.french?.trim();
  return french || undefined;
}

async function translateFrToEn(french: string): Promise<string | undefined> {
  const userPrompt = `Return JSON { "english": "…" }. Translate this French tutor subtitle into natural British English for the top caption row. Preserve brevity and teaching tone.\n\nFrench:\n${french}`;
  const schema = {
    type: "object",
    properties: {
      english: { type: "string", description: "British English teaching subtitle." },
    },
    required: ["english"],
  };
  const text = await generateContent(
    userPrompt,
    TRANSLATE_FR_TO_EN_SYSTEM,
    schema,
    256,
    0.2,
  );
  if (!text) return undefined;
  const parsed = parseJsonBlob<{ english?: string }>(text);
  const english = parsed?.english?.trim();
  return english || undefined;
}

async function ensureEnglishSubtitleLine(
  english: string,
  french?: string | null,
): Promise<SubtitleLines | null> {
  let normalized = normalizeSubtitleLines(english, french);
  if (!normalized.english && normalized.french) {
    const translated = await translateFrToEn(normalized.french);
    if (translated) {
      normalized = { english: translated, french: normalized.french };
    }
  }
  if (!normalized.english) return null;
  let fr = normalized.french?.trim() || undefined;
  if (!fr && !isLikelyFrench(normalized.english)) {
    fr = await translateEnToFr(normalized.english);
  }
  return { english: normalized.english, french: fr ?? null };
}

export async function geminiSubtitlesLlm(
  raw: string,
): Promise<SubtitleLines | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const schema = {
    type: "object",
    properties: {
      english: { type: "string" },
      french: { type: "string" },
    },
    required: ["english", "french"],
  };

  const userPrompt = `Return JSON with keys english and french (both non-empty when there is anything to caption).
- english: British English subtitle (top row) — the teaching line in English.
- french: Parisian French subtitle (bottom row) — the French line (spoken French when tutor spoke French, otherwise a translation of english).
If raw is French audio transcription, do NOT put French in english and English in french.
Only fix obvious ASR errors; stay faithful to what was taught.

Raw:
${trimmed}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, Math.min(200 * 2 ** (attempt - 1), 1500)));
    }
    const text = await generateContent(
      userPrompt,
      CAPTION_SYSTEM,
      schema,
      512,
      0.15,
    );
    if (!text) continue;
    const lines = parseJsonBlob<SubtitleLines>(text);
    if (!lines?.english?.trim() && !lines?.french?.trim()) continue;
    const ensured = await ensureEnglishSubtitleLine(
      lines.english?.trim() ?? "",
      lines.french?.trim() || null,
    );
    if (ensured) return ensured;
  }

  if (isLikelyFrench(trimmed)) {
    const english = await translateFrToEn(trimmed);
    if (english) return { english, french: trimmed };
  }

  return null;
}
