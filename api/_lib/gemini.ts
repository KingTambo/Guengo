import { env } from "./env";

export const GEMINI_LIVE_MODEL =
  "gemini-2.5-flash-native-audio-preview-12-2025";

const CAPTION_SYSTEM = `Guengo live tutor — on-screen captions only.
You receive rough transcripts/snippets from Gemini Live (often English audio transcription).
The learner may have spoken English or French, but tutor output must always caption as British English primary with Parisian French translating that English underneath — never substitute a French-forward line.
Derive one clean English subtitle line; the French field must be a Parisian French translation of THAT English line only — not a separate paraphrase of mixed raw text.
Never put Spanish, Portuguese, Mandarin, Hindi, Arabic, German, Korean, or any third language into either field — only standard British tutor English plus Parisian French that translates that English. If raw contains odd tokens from bad ASR, prefer normalising to the intended English teaching line.
Return JSON matching the schema: both "english" and "french" are required strings.`;

const TRANSLATE_SUBTITLE_SYSTEM =
  "Guengo subtitle translator. Output JSON only. Parisian French, brief, same teaching tone as the English line.";

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
- english: one clean subtitle line — the tutor's English only — derived from raw below.
- french: translate THAT english line into natural Parisian French (subtitle style). french must correspond to english, not stray French from raw.
Only fix obvious ASR errors on the English; stay faithful to what was taught.

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
    if (!lines?.english?.trim()) continue;
    let english = lines.english.trim();
    let french = lines.french?.trim() || undefined;
    if (!french) {
      french = await translateEnToFr(english);
    }
    return { english, french: french ?? null };
  }
  return null;
}
