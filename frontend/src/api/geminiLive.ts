import {
  EndSensitivity,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import { hasFrenchOrthographyHints, mergeStreamingCaptionParts, normalizeSubtitlePair } from "../lib/displayText";
import { logSessionIssue } from "../lib/sessionLog";
import { logSubtitle, previewText } from "../lib/subtitleDebug";
import { PcmCapture, PcmPlayer } from "../lib/pcmStream";

export type FocusTopic = {
  id: string;
  label: string;
};

export type LiveConfig = {
  token: string;
  model: string;
  system_instruction: string;
  welcome: string;
  step_count: number;
  cached_opening: boolean;
  /** English line that bundled intro PCM was built from (+ optional subtitle). Overrides `welcome` for on-screen intros when cached. */
  opening_caption_english?: string | null;
  opening_caption_french?: string | null;
  focus_topics: FocusTopic[];
};

/** Topic shell + captions + prompts without minting a Gemini token (`GET /api/live/session-shell`). */
export type LiveSessionShell = {
  welcome: string;
  cached_opening: boolean;
  opening_caption_english?: string | null;
  opening_caption_french?: string | null;
  step_count: number;
  system_instruction: string;
  gemini_live_ready: boolean;
  focus_topics: FocusTopic[];
};

export type LiveSessionCallbacks = {
  onConnected?: () => void;
  onSpeakingChange?: (speaking: boolean) => void;
  /** Primary English subtitle line — merged from transcription + model text (`emitMergedCaptionUpdate`). Empty string clears. */
  onText?: (text: string) => void;
  /** French line: translation of finalized English caption from `/api/live/subtitles`. Null clears between turns. */
  onFrenchSubtitle?: (text: string | null) => void;
  onLevel?: (level: number) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
};

export async function fetchTurnNudge(
  topicId: string,
  step: number,
  focus?: string | null,
): Promise<string | null> {
  const params = new URLSearchParams({
    topic_id: topicId,
    step: String(step),
  });
  if (focus) params.set("focus", focus);
  const response = await fetch(`/api/live/nudge?${params}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { nudge: string };
  return data.nudge;
}

function liveConfigSearchParams(topicId: string, focus?: string | null) {
  const params = new URLSearchParams({ topic_id: topicId });
  if (focus) params.set("focus", focus);
  return params;
}

export async function fetchLiveConfig(
  topicId: string,
  focus?: string | null,
): Promise<LiveConfig> {
  const response = await fetch(
    `/api/live/config?${liveConfigSearchParams(topicId, focus)}`,
  );
  if (!response.ok) {
    throw new Error("Session vocale Gemini indisponible.");
  }
  const data = (await response.json()) as LiveConfig & { focus_topics?: FocusTopic[] };
  return {
    ...data,
    focus_topics: Array.isArray(data.focus_topics) ? data.focus_topics : [],
  };
}

export async function fetchLiveSessionShell(
  topicId: string,
  focus?: string | null,
): Promise<LiveSessionShell> {
  const response = await fetch(
    `/api/live/session-shell?${liveConfigSearchParams(topicId, focus)}`,
  );
  if (!response.ok) {
    throw new Error("Session shell API indisponible.");
  }
  const data = (await response.json()) as LiveSessionShell & {
    focus_topics?: FocusTopic[];
  };
  return {
    ...data,
    focus_topics: Array.isArray(data.focus_topics) ? data.focus_topics : [],
  };
}

export async function fetchOpeningAudio(
  topicId: string,
): Promise<{ audio: string; sample_rate: number } | null> {
  const response = await fetch(
    `/api/live/opening-audio?topic_id=${encodeURIComponent(topicId)}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error("Intro vocale indisponible.");
  }
  return (await response.json()) as { audio: string; sample_rate: number };
}

/** Same raw snapshot ⇒ reuse caption result for this browser tab (no `/api/live/subtitles` replay). */
const SUBTITLE_TAB_CACHE_LIMIT = 128;
const subtitleTabCache = new Map<
  string,
  { english: string; french: string | null }
>();

function normalizeSubtitleLookupKey(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** LRU bump on read. */
function subtitleCacheTouch(key: string) {
  const entry = subtitleTabCache.get(key);
  if (!entry) return undefined;
  subtitleTabCache.delete(key);
  subtitleTabCache.set(key, entry);
  return entry;
}

function subtitleCacheInsert(
  key: string,
  value: { english: string; french: string | null },
) {
  if (subtitleTabCache.has(key)) {
    subtitleTabCache.delete(key);
  }
  subtitleTabCache.set(key, value);
  while (subtitleTabCache.size > SUBTITLE_TAB_CACHE_LIMIT) {
    const oldest = subtitleTabCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    subtitleTabCache.delete(oldest);
  }
}

/** Gemini text captions for the tutor line (runs after Live turn completes). */
export async function fetchLiveSubtitleLlm(
  raw: string,
): Promise<{ english: string; french: string | null } | null> {
  const trimmed = raw.trim();
  if (!trimmed.length) return null;

  const lookupKey = normalizeSubtitleLookupKey(trimmed);
  const tabHit = subtitleCacheTouch(lookupKey);
  if (tabHit) {
    logSubtitle("captions.tab-cache.hit", {
      preview: previewText(lookupKey, 96),
    });
    return tabHit;
  }

    try {
      logSubtitle("captions.tab-cache.miss", {
        preview: previewText(lookupKey, 96),
      });
      const body = JSON.stringify({ raw: trimmed });
      let res = await fetch("/api/live/subtitles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      // One quick retry helps transient Gemini 503s / cold pool (see backend logs).
      if (res.status === 503) {
        logSubtitle("captions.http.retry-503", { waitMs: 350 });
        await new Promise((r) => window.setTimeout(r, 350));
        res = await fetch("/api/live/subtitles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      }
      if (!res.ok) {
      logSubtitle("captions.http.error", {
        status: res.status,
        statusText: res.statusText,
        hint:
          res.status === 503
            ? "API key / Gemini caption model failed server-side — check GEMINI_API_KEY and backend logs."
            : undefined,
      });
      return null;
    }
    const data = (await res.json()) as {
      english?: string;
      french?: string | null;
    };
    const rawEn = data.english?.trim() ?? "";
    if (!rawEn && !data.french?.trim()) return null;
    const normalized = normalizeSubtitlePair(
      rawEn,
      typeof data.french === "string" && data.french.trim().length > 0
        ? data.french.trim()
        : null,
    );
    const english = normalized.english;
    if (!english) return null;
    const french = normalized.french;
    if (!french) {
      logSubtitle("captions.http.french-missing", {
        englishPreview: previewText(english, 140),
      });
    }
    const out = { english, french };
    subtitleCacheInsert(lookupKey, out);
    return out;
  } catch (err) {
    logSubtitle("captions.fetch.exception", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export class GeminiLiveSession {
  private session: Session | null = null;
  private capture = new PcmCapture();
  private player = new PcmPlayer();
  private callbacks: LiveSessionCallbacks = {};
  private speakingPoll: number | null = null;
  private closed = false;
  private streaming = false;
  private micHandlersAttached = false;
  /** Buffered text from Live output-audio transcription (distinct from flaky modelTurn.text). */
  private outputTranscriptBuffer = "";
  private outputTranscriptSegmentDone = false;
  /** Non-thought text from modelTurn, used only to recover bilingual French captions (speech transcript is often EN-only). */
  private modelTurnCaptionBuffer = "";
  /** Bumped on interrupt so in-flight subtitle LLM work does not apply after mic cut */
  private subtitleEpoch = 0;
  /** Serializes caption LLM calls so responses stay ordered */
  private subtitlePolishChain: Promise<void> = Promise.resolve();
  /** Avoids double enqueue when Live sends generationComplete then turnComplete for the same line */
  private subtitlePolishDedupeKey: string | null = null;
  /** Debounced LLM polish while streaming French-only transcripts (English row stays empty until reply). */
  private subtitleStreamPolishTimer: number | null = null;

  async connect(config: LiveConfig, callbacks: LiveSessionCallbacks): Promise<void> {
    this.close();
    this.callbacks = callbacks;
    this.closed = false;

    const ai = new GoogleGenAI({
      apiKey: config.token,
      httpOptions: { apiVersion: "v1alpha" },
    });

    const session = await ai.live.connect({
      model: config.model,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: {
          parts: [{ text: config.system_instruction }],
        },
        maxOutputTokens: 200,
        temperature: 0.15,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Puck" },
          },
          // When the API honours it (non-native speech); native-audio ignores it — tutor prompt still pins English aloud.
          languageCode: "en-GB",
        },
        realtimeInputConfig: {
          automaticActivityDetection: {
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
            prefixPaddingMs: 10,
            silenceDurationMs: 200,
          },
        },
        // Needed for learner subtitles alongside native audio (see Live API docs: output transcription).
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => {
          this.callbacks.onConnected?.();
        },
        onmessage: (message: LiveServerMessage) => {
          this.handleMessage(message);
        },
        onerror: (event: ErrorEvent) => {
          logSessionIssue("live.error", event.message || "Erreur Live API.");
        },
        onclose: () => {
          this.stopSpeakingPoll();
          this.callbacks.onClose?.();
        },
      },
    });

    this.session = session;
    await this.player.resumeOutput();
    this.player.warm();
    logSubtitle("live.connect.ready", { model: config.model });
    this.startSpeakingPoll();
  }

  async warmMic(): Promise<void> {
    await this.ensureMicPipeline();
  }

  /** Trigger the model to speak the session opening for a guided lesson step. */
  sendTurnNudge(nudge: string): void {
    if (!this.session || this.closed) return;
    this.session.sendClientContent({
      turns: [{ role: "user", parts: [{ text: nudge }] }],
      turnComplete: true,
    });
  }

  private async ensureMicPipeline(): Promise<void> {
    await this.capture.ensureStarted({
      onChunk: (base64Pcm) => {
        if (!this.streaming) return;
        this.session?.sendRealtimeInput({
          media: {
            mimeType: "audio/pcm;rate=16000",
            data: base64Pcm,
          },
        });
      },
      onLevel: (level) => {
        this.callbacks.onLevel?.(level);
      },
    });
    this.micHandlersAttached = true;
  }

  /** Merge streamed model captions; tolerate both delta chunks and cumulative strings. */
  private ingestCaptionModelChunk(chunk: string): void {
    if (!chunk.trim()) return;
    const prev = this.modelTurnCaptionBuffer;
    if (!prev) {
      this.modelTurnCaptionBuffer = chunk;
      return;
    }
    if (chunk.startsWith(prev)) {
      this.modelTurnCaptionBuffer = chunk;
      return;
    }
    if (prev.startsWith(chunk) && chunk.length < prev.length) {
      return;
    }
    if (prev.includes(chunk) && chunk.length < prev.length * 0.9) {
      return;
    }
    this.modelTurnCaptionBuffer = prev + chunk;
  }

  private enqueuePolishedSubtitlesFromLlm(snapshot: string): void {
    const trimmed = snapshot.trim();
    if (!trimmed.length) return;
    const epochAtQueue = this.subtitleEpoch;

    this.subtitlePolishChain = this.subtitlePolishChain
      .then(async () => {
        if (this.closed || this.subtitleEpoch !== epochAtQueue) return;

        logSubtitle("captions.llm.request", {
          chars: trimmed.length,
          preview: previewText(trimmed, 100),
        });

        const out = await fetchLiveSubtitleLlm(trimmed);
        if (this.closed || this.subtitleEpoch !== epochAtQueue) return;
        if (!out) {
          logSubtitle("captions.llm.unavailable", { keptLocalMerged: true });
          return;
        }

        logSubtitle("captions.llm.reply", {
          previewEn: previewText(out.english, 120),
          previewFr: out.french ? previewText(out.french, 100) : null,
        });
        const normalized = normalizeSubtitlePair(out.english, out.french);
        if (normalized.english) {
          this.callbacks.onText?.(normalized.english);
        }
        if (normalized.french) {
          this.callbacks.onFrenchSubtitle?.(normalized.french);
        } else {
          this.callbacks.onFrenchSubtitle?.(null);
        }
      })
      .catch(() => {});
  }

  private clearSubtitleStreamPolishTimer(): void {
    if (this.subtitleStreamPolishTimer !== null) {
      window.clearTimeout(this.subtitleStreamPolishTimer);
      this.subtitleStreamPolishTimer = null;
    }
  }

  /** When Live transcribes French speech, derive the English top row via caption LLM. */
  private maybeEnqueueStreamSubtitlePolish(): void {
    const snap = this.llmSubtitleSnapshot().trim();
    if (snap.length < 10) return;

    this.clearSubtitleStreamPolishTimer();
    this.subtitleStreamPolishTimer = window.setTimeout(() => {
      this.subtitleStreamPolishTimer = null;
      if (this.closed) return;
      logSubtitle("captions.stream-polish", {
        preview: previewText(snap, 120),
      });
      this.enqueuePolishedSubtitlesFromLlm(snap);
    }, 450);
  }

  private llmSubtitleSnapshot(): string {
    const t = this.outputTranscriptBuffer.trim();
    const m = this.modelTurnCaptionBuffer.trim();
    if (!t.length) return m;
    if (!m.length) return t;
    return `${t}\n---\n${m}`;
  }

  /** Merge streamed output transcription + model text. EN = top/black, FR = bottom/blue. */
  private emitMergedCaptionUpdate(): void {
    const rawTrans = this.outputTranscriptBuffer.trim();
    const rawModel = this.modelTurnCaptionBuffer.trim();
    const { english, french } = mergeStreamingCaptionParts(rawTrans, rawModel);

    if (french) {
      this.callbacks.onFrenchSubtitle?.(french);
    }

    if (english) {
      logSubtitle("emit.onText", {
        length: english.length,
        preview: previewText(english, 140),
      });
      this.callbacks.onText?.(english);
      return;
    }

    if (french) {
      logSubtitle("emit.french-only", {
        transcriptBufferLen: rawTrans.length,
        modelBufferLen: rawModel.length,
        frenchPreview: previewText(french, 80),
      });
      this.maybeEnqueueStreamSubtitlePolish();
      return;
    }

    logSubtitle("emit.no-english", {
      transcriptBufferLen: rawTrans.length,
      modelBufferLen: rawModel.length,
      transcriptPreview: previewText(rawTrans, 80),
      modelPreview: previewText(rawModel, 80),
    });
  }

  private handleMessage(message: LiveServerMessage): void {
    if (message.setupComplete != null) {
      logSubtitle("live.setupComplete", {
        sessionReady: true,
        hint: "If subtitles stay empty, check live.serverContent outTxDeltaLen and textParts*",
      });
      return;
    }

    const content = message.serverContent;
    if (!content) return;

    if (content.interrupted) {
      logSubtitle("live.interrupted", { clearingCaptions: true });
      this.subtitleEpoch += 1;
      this.subtitlePolishDedupeKey = null;
      this.clearSubtitleStreamPolishTimer();
      this.outputTranscriptBuffer = "";
      this.outputTranscriptSegmentDone = false;
      this.modelTurnCaptionBuffer = "";
      this.callbacks.onFrenchSubtitle?.(null);
      this.callbacks.onText?.("");
      this.player.stop();
      this.callbacks.onSpeakingChange?.(false);
      return;
    }

    const parts = content.modelTurn?.parts ?? [];
    for (const part of parts) {
      const inline = part.inlineData;
      if (inline?.data && inline.mimeType?.includes("audio/pcm")) {
        this.player.enqueueBase64(inline.data);
        this.callbacks.onSpeakingChange?.(true);
      }
    }

    let modelSnippet = "";
    for (const part of parts) {
      if (part.thought || !part.text) continue;
      modelSnippet += part.text;
    }

    const outTx = content.outputTranscription;
    if (outTx?.text) {
      if (this.outputTranscriptSegmentDone) {
        logSubtitle("live.outputTranscription.newSegment", {
          clearingBuffers: true,
        });
        this.outputTranscriptBuffer = "";
        this.outputTranscriptSegmentDone = false;
        this.modelTurnCaptionBuffer = "";
        this.callbacks.onFrenchSubtitle?.(null);
        this.callbacks.onText?.("");
        this.subtitlePolishDedupeKey = null;
      }
      this.outputTranscriptBuffer += outTx.text;
    }
    if (outTx?.finished) {
      this.outputTranscriptSegmentDone = true;
    }

    if (modelSnippet) {
      this.ingestCaptionModelChunk(modelSnippet);
    }

    logSubtitle("live.serverContent", {
      turnComplete: Boolean(content.turnComplete),
      generationComplete: Boolean(content.generationComplete),
      modelPartCount: parts.length,
      audioPcmParts: parts.filter(
        (p) => p.inlineData?.mimeType?.includes("audio/pcm"),
      ).length,
      textPartsNonThought: parts.filter((p) => Boolean(p.text) && !p.thought)
        .length,
      textPartsThoughtOnly: parts.filter((p) => Boolean(p.text) && p.thought)
        .length,
      outTxDeltaLen: outTx?.text?.length ?? 0,
      outTxFinished: Boolean(outTx?.finished),
      transcriptBufferLen: this.outputTranscriptBuffer.length,
      modelCaptionBufferLen: this.modelTurnCaptionBuffer.length,
      modelSnippetPreview: previewText(modelSnippet, 100),
    });

    // Single merge per server message keeps EN/French aligned above the meter.
    this.emitMergedCaptionUpdate();

    // Polish bilingual lines once text is final. Some sessions emit generationComplete before turnComplete.
    const modelDone =
      Boolean(content.turnComplete) || Boolean(content.generationComplete);
    if (modelDone) {
      const snap = this.llmSubtitleSnapshot().trim();
      if (snap) {
        const dedupeKey = normalizeSubtitleLookupKey(snap);
        if (dedupeKey === this.subtitlePolishDedupeKey) {
          logSubtitle("live.turn.subtitle-skip-duplicate", {
            preview: previewText(snap, 120),
            hint: "generationComplete + turnComplete often share the same snapshot",
          });
        } else {
          this.subtitlePolishDedupeKey = dedupeKey;
          logSubtitle("live.turn.outputTranscriptSnapshot", {
            chars: snap.length,
            frenchOrthographyHints: hasFrenchOrthographyHints(snap),
            preview: previewText(snap, 200),
            ...(hasFrenchOrthographyHints(snap)
              ? {
                  note: "`outputAudioTranscription` usually matches synthesized speech language; subtitle LLM still normalizes captions to EN.",
                }
              : {}),
          });
          this.enqueuePolishedSubtitlesFromLlm(snap);
        }
      }
    }

    if (content.turnComplete) {
      this.subtitlePolishDedupeKey = null;
      // Without this, the next tutor reply can keep merging the previous turn's
      // outputAudioTranscription / model text when Live omits or delays new deltas,
      // so EN/FR captions look frozen on the first line.
      this.outputTranscriptBuffer = "";
      this.outputTranscriptSegmentDone = false;
      this.modelTurnCaptionBuffer = "";
      this.callbacks.onSpeakingChange?.(this.player.isPlaying());
    }
  }

  private startSpeakingPoll(): void {
    this.stopSpeakingPoll();
    const tick = () => {
      if (this.closed) return;
      this.callbacks.onSpeakingChange?.(this.player.isPlaying());
      this.speakingPoll = window.requestAnimationFrame(tick);
    };
    this.speakingPoll = window.requestAnimationFrame(tick);
  }

  private stopSpeakingPoll(): void {
    if (this.speakingPoll !== null) {
      cancelAnimationFrame(this.speakingPoll);
      this.speakingPoll = null;
    }
  }

  async startMic(): Promise<void> {
    if (!this.session) {
      throw new Error("Session Live non connectée.");
    }

    this.player.stop();
    await this.ensureMicPipeline();
    this.streaming = true;
    this.capture.setSending(true);
  }

  stopMic(nudge?: string): void {
    this.capture.setSending(false);
    this.streaming = false;
    if (!this.session) return;
    if (nudge) {
      this.session.sendClientContent({
        turns: [{ role: "user", parts: [{ text: nudge }] }],
        turnComplete: false,
      });
    }
    // Flush buffered audio — triggers the model reply immediately.
    this.session.sendRealtimeInput({ audioStreamEnd: true });
  }

  interrupt(): void {
    logSubtitle("session.interrupt", { clearingCaptions: true });
    this.subtitleEpoch += 1;
    this.subtitlePolishDedupeKey = null;
    this.clearSubtitleStreamPolishTimer();
    this.player.stop();
    this.capture.setSending(false);
    this.streaming = false;
    this.outputTranscriptBuffer = "";
    this.outputTranscriptSegmentDone = false;
    this.modelTurnCaptionBuffer = "";
    this.callbacks.onFrenchSubtitle?.(null);
    this.callbacks.onText?.("");
    this.callbacks.onSpeakingChange?.(false);
  }

  close(): void {
    this.closed = true;
    this.subtitleEpoch += 1;
    this.subtitlePolishDedupeKey = null;
    this.clearSubtitleStreamPolishTimer();
    this.subtitlePolishChain = Promise.resolve();
    this.capture.setSending(false);
    this.streaming = false;
    this.player.stop();
    this.capture.stop();
    this.stopSpeakingPoll();
    this.session?.close();
    this.session = null;
    this.player.close();
    this.micHandlersAttached = false;
    this.callbacks = {};
  }
}
