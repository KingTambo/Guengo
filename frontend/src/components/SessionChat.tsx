import { useEffect, useRef, useState } from "react";
import { fetchLiveConfig, fetchOpeningAudio, fetchLiveSessionShell, fetchTurnNudge, GeminiLiveSession } from "../api/geminiLive";
import { splitDisplayParts } from "../lib/displayText";
import { logSubtitle, previewText } from "../lib/subtitleDebug";
import {
  ensureAudioPlaybackUnlocked,
  unlockAudioPlayback,
} from "../lib/audioUnlock";
import {
  loadOpeningCaptionsStatic,
  loadOpeningPcmStatic,
} from "../lib/openingsStatic";
import { playPcmBase64Once, playRawPcm24kMonoLeOnce } from "../lib/pcmStream";
import { MicLevelMeter } from "./MicLevelMeter";
import { UserMenuDropdown } from "./UserMenuDropdown";
import type { SessionSelection } from "../data/curriculum";

type SessionChatProps = {
  topic: SessionSelection;
  /** Optional drill-in focus (reserved; not surfaced in briefing UI). */
  focusId?: string | null;
  onExit: () => void;
};

export function SessionChat({
  topic,
  focusId = null,
  onExit,
}: SessionChatProps) {
  const [booting, setBooting] = useState(true);
  const [waitingReply, setWaitingReply] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Connexion…");
  const [openingEnglish, setOpeningEnglish] = useState<string | null>(null);
  const [openingFrench, setOpeningFrench] = useState<string | null>(null);
  const [openingDismissed, setOpeningDismissed] = useState(false);
  const [replyEnglish, setReplyEnglish] = useState<string | null>(null);
  const [replyFrench, setReplyFrench] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [openingPlaying, setOpeningPlaying] = useState(false);
  /** False until Gemini Live connects — mic offline without key even if bundled intro ran. */
  const [voiceLoopReady, setVoiceLoopReady] = useState(false);

  const liveSessionRef = useRef<GeminiLiveSession | null>(null);
  const cancelledRef = useRef(false);
  const listeningRef = useRef(false);
  const stepCountRef = useRef(0);
  const currentStepRef = useRef(1);
  const topicIdRef = useRef(topic.id);
  const focusIdRef = useRef<string | null>(null);
  const levelTargetRef = useRef(0);
  const levelDisplayRef = useRef(0);
  const levelFrameRef = useRef<number | null>(null);

  function stopLevelAnimation() {
    if (levelFrameRef.current !== null) {
      cancelAnimationFrame(levelFrameRef.current);
      levelFrameRef.current = null;
    }
    levelTargetRef.current = 0;
    levelDisplayRef.current = 0;
    setMicLevel(0);
  }

  function startLevelAnimation() {
    stopLevelAnimation();

    const tick = () => {
      const target = levelTargetRef.current;
      const current = levelDisplayRef.current;
      const next = current + (target - current) * 0.5;
      levelDisplayRef.current = next;
      setMicLevel(next);
      levelFrameRef.current = requestAnimationFrame(tick);
    };

    levelFrameRef.current = requestAnimationFrame(tick);
  }

  function interruptGuengo() {
    liveSessionRef.current?.interrupt();
    setSpeaking(false);
    setWaitingReply(false);
  }

  /**
   * Plays bundled intro PCM: static file under `/audio/openings/<id>.pcm` first,
   * then `/api/live/opening-audio` if needed.
   */
  async function playCachedOpening(
    topicId: string,
    prefetchedStaticPcm: ArrayBuffer | null,
  ): Promise<boolean> {
    try {
      await ensureAudioPlaybackUnlocked();
      if (cancelledRef.current) return false;

      let raw: ArrayBuffer | null =
        prefetchedStaticPcm && prefetchedStaticPcm.byteLength >= 2
          ? prefetchedStaticPcm
          : null;
      if (!raw) {
        raw = await loadOpeningPcmStatic(topicId);
      }

      if (raw && raw.byteLength >= 2) {
        setOpeningPlaying(true);
        setStatus("Guengo présente la leçon…");
        await playRawPcm24kMonoLeOnce(raw);
        if (cancelledRef.current) return false;

        setOpeningDismissed(true);
        return true;
      }

      const clip = await fetchOpeningAudio(topicId);
      if (cancelledRef.current) return false;

      if (!clip?.audio) {
        setError(
          "Pas de fichier audio d’introduction (.pcm). Ajoutez-le sous frontend/public/audio/openings/ ou exécutez npm run warm:opening-audio (option --synthesize-if-missing + GEMINI_API_KEY pour le générer une fois en local).",
        );
        return false;
      }

      setOpeningPlaying(true);
      setStatus("Guengo présente la leçon…");
      await playPcmBase64Once(clip.audio);
      if (cancelledRef.current) return false;

      setOpeningDismissed(true);
      return true;
    } catch {
      if (!cancelledRef.current) {
        setError(
          "Lecture de l’intro impossible. Si l’API est hors ligne, vérifiez que le fichier .pcm est bien servi sous /audio/openings/. Sinon cliquez encore sur démarrer ou vérifiez le volume du navigateur.",
        );
      }
      return false;
    } finally {
      if (!cancelledRef.current) {
        setOpeningPlaying(false);
      }
    }
  }

  useEffect(() => {
    if (!listening) return;

    const timer = window.setTimeout(() => {
      if (listeningRef.current && levelDisplayRef.current < 0.015) {
        setError(
          "Aucun signal du micro. Windows : Paramètres → Confidentialité → Microphone.",
        );
      }
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [listening]);

  useEffect(() => {
    setVoiceSupported(typeof navigator.mediaDevices?.getUserMedia === "function");
  }, []);

  useEffect(() => {
    let cancelled = false;
    cancelledRef.current = false;

    async function connectLive() {
      setBooting(true);
      setVoiceLoopReady(false);
      setError(null);
      setStatus("Connexion…");
      setOpeningPlaying(false);
      setOpeningDismissed(false);

      const activeFocus = focusId ?? undefined;
      focusIdRef.current = focusId;
      topicIdRef.current = topic.id;

      const [staticCap, staticPcm, shell] = await Promise.all([
        loadOpeningCaptionsStatic(topic.id),
        loadOpeningPcmStatic(topic.id),
        fetchLiveSessionShell(topic.id, activeFocus).catch(() => null),
      ]);
      if (cancelled) return;

      stepCountRef.current = shell?.step_count ?? 0;
      currentStepRef.current = 0;

      let openingEn: string;
      let openingFr: string | null = null;
      if (
        staticCap?.english?.trim()
      ) {
        openingEn = staticCap.english.trim();
        openingFr = staticCap.french ?? null;
      } else if (
        shell?.cached_opening &&
        typeof shell.opening_caption_english === "string" &&
        shell.opening_caption_english.trim().length > 0
      ) {
        openingEn = shell.opening_caption_english.trim();
        openingFr =
          typeof shell.opening_caption_french === "string" &&
          shell.opening_caption_french.trim().length > 0
            ? shell.opening_caption_french.trim()
            : null;
      } else if (shell?.welcome) {
        const display = splitDisplayParts(shell.welcome);
        openingEn = display.english.trim() ? display.english : shell.welcome;
        openingFr = display.french;
      } else {
        const fallback = splitDisplayParts(topic.description);
        openingEn = (fallback.english.trim() || topic.label).trim();
        openingFr = fallback.french;
      }
      setOpeningEnglish(openingEn);
      setOpeningFrench(openingFr);

      let geminiLiveReady = Boolean(shell?.gemini_live_ready);
      if (!shell) {
        try {
          const r = await fetch("/api/config", { cache: "no-store" });
          if (r.ok) {
            const j = (await r.json()) as { gemini_live?: boolean };
            geminiLiveReady = Boolean(j.gemini_live);
          }
        } catch {
          geminiLiveReady = false;
        }
      }

      await ensureAudioPlaybackUnlocked();
      if (cancelled) return;

      const staticPcmOk = Boolean(staticPcm && staticPcm.byteLength >= 2);
      const shouldPlayIntro = staticPcmOk || shell?.cached_opening === true;
      if (shouldPlayIntro) {
        await playCachedOpening(topic.id, staticPcmOk ? staticPcm : null);
      }
      if (cancelled) return;

      if (!geminiLiveReady) {
        setBooting(false);
        setVoiceLoopReady(false);
        setStatus("Micro désactivé");
        setError(
          "L’introduction locale peut être lue sans clé. Pour répondre à Guengo, ajoutez GEMINI_API_KEY au fichier .env, redémarrez l’API, puis rechargez la page.",
        );
        return;
      }

      try {
        const config = await fetchLiveConfig(topic.id, activeFocus);
        if (cancelled) return;

        const live = new GeminiLiveSession();
        liveSessionRef.current = live;

        await live.connect(config, {
          onConnected: () => {
            if (cancelled) return;
            setVoiceLoopReady(true);
            setBooting(false);

            void (async () => {
              if (cancelled) return;
              setStatus("Appuyez sur le micro");
            })();

            void live.warmMic().catch(() => {
              // Permission prompt may wait until first press.
            });
          },
          onSpeakingChange: (active) => {
            if (cancelled) return;
            setSpeaking(active);
            if (active) {
              setOpeningDismissed(true);
              setWaitingReply(false);
              setStatus("Guengo parle — appuyez pour répondre");
            } else if (!listeningRef.current) {
              setStatus("Appuyez sur le micro");
            }
          },
          onText: (text) => {
            if (cancelled) return;
            const trimmed = text.trim();
            logSubtitle("ui.onText", {
              cleared: trimmed.length === 0,
              preview: trimmed.length ? previewText(trimmed, 160) : "",
            });
            if (!trimmed.length) {
              setReplyEnglish(null);
              return;
            }
            const parts = splitDisplayParts(trimmed);
            const lineEn = parts.english.trim()
              ? parts.english.trim()
              : trimmed;
            setReplyEnglish(lineEn);
            // French row: only updated via `onFrenchSubtitle` (translation of finalized English).
          },
          onFrenchSubtitle: (fr) => {
            if (cancelled) return;
            logSubtitle("ui.onFrenchSubtitle", {
              cleared: fr === null,
              preview: fr ? previewText(fr, 160) : "",
            });
            setReplyFrench(fr ?? null);
          },
          onLevel: (level) => {
            levelTargetRef.current = level;
          },
          onError: (message) => {
            if (cancelled) return;
            setError(message);
            setWaitingReply(false);
            setStatus("Appuyez sur le micro");
          },
          onClose: () => {
            if (cancelled) return;
            setVoiceLoopReady(false);
            setError("Session vocale fermée.");
          },
        });

        if (!cancelled) setBooting(false);
      } catch {
        if (cancelled) return;
        setVoiceLoopReady(false);
        setError(
          "Réponses Gemini Live indisponibles (clé invalide ou token refusé). L’introduction locale peut quand même rester audible si le fichier est servi sous /audio/openings/.",
        );
        setStatus("");
        setBooting(false);
      }
    }

    void connectLive();

    return () => {
      cancelled = true;
      cancelledRef.current = true;
      interruptGuengo();
      setVoiceLoopReady(false);
      liveSessionRef.current?.close();
      liveSessionRef.current = null;
      listeningRef.current = false;
      stopLevelAnimation();
    };
  }, [topic.id, focusId]);

  async function startListening() {
    if (listeningRef.current || !voiceLoopReady || !liveSessionRef.current)
      return;

    try {
      setError(null);
      startLevelAnimation();
      await liveSessionRef.current?.startMic();
      listeningRef.current = true;
      setListening(true);
      setStatus("Parlez…");
    } catch {
      stopLevelAnimation();
      listeningRef.current = false;
      setListening(false);
      setError("Micro inaccessible.");
    }
  }

  function stopListening() {
    listeningRef.current = false;
    setListening(false);
    stopLevelAnimation();
    setWaitingReply(true);
    setStatus("…");

    const stepCount = stepCountRef.current;
    if (stepCount > 0) {
      const focus = focusIdRef.current ?? undefined;

      const nextStep = Math.min(currentStepRef.current + 1, stepCount);
      void fetchTurnNudge(topicIdRef.current, nextStep, focus).then((nudge) => {
        liveSessionRef.current?.stopMic(nudge ?? undefined);
        if (nextStep > currentStepRef.current) {
          currentStepRef.current = nextStep;
        }
      });
    } else {
      liveSessionRef.current?.stopMic();
    }
  }

  function handleMicClick() {
    if (openingPlaying) return;

    unlockAudioPlayback();

    if (listeningRef.current) {
      stopListening();
      return;
    }

    interruptGuengo();
    void startListening();
  }

  function handleExit() {
    interruptGuengo();
    stopLevelAnimation();
    liveSessionRef.current?.close();
    liveSessionRef.current = null;
    onExit();
  }

  const micDisabled = booting || openingPlaying || !voiceLoopReady;
  const showWaiting = waitingReply && !listening && !speaking && !openingPlaying;
  // Welcome line: cached intro playback, or idle before first exchange — never steal the live reply lane.
  const showOpening =
    Boolean(openingEnglish) &&
    !openingDismissed &&
    !listening &&
    (openingPlaying ||
      (!replyEnglish && !waitingReply && !speaking));
  // Live tutor/user exchange captions (EN + FR from stream + caption LLM).
  const showReply =
    Boolean(replyEnglish) && !listening && !showOpening;
  const displayEnglish = showReply ? replyEnglish : showOpening ? openingEnglish : null;
  const displayFrench = showReply ? replyFrench : showOpening ? openingFrench : null;
  const showTextBlock = Boolean(displayEnglish) && (showOpening || showReply);
  /** FR often arrives async after EN; reserve layout so captions do not jump. */
  const reserveFrenchSubtitleSlot =
    showReply || Boolean(showOpening && displayFrench);

  useEffect(() => {
    logSubtitle("ui.visibility", {
      showTextBlock,
      showOpening,
      showReply,
      listening,
      waitingReply,
      speaking,
      openingPlaying,
      openingDismissed,
      openingEnglishPreview: openingEnglish
        ? previewText(openingEnglish, 100)
        : null,
      replyEnglishPreview: replyEnglish
        ? previewText(replyEnglish, 100)
        : null,
      replyFrenchPreview: replyFrench ? previewText(replyFrench, 100) : null,
    });
  }, [
    showTextBlock,
    showOpening,
    showReply,
    listening,
    waitingReply,
    speaking,
    openingPlaying,
    openingDismissed,
    openingEnglish,
    replyEnglish,
    replyFrench,
  ]);

  return (
    <section className="voice-live" aria-label={`Session vocale — ${topic.label}`}>
      <header className="voice-live__header">
        <button
          type="button"
          className="btn btn--ghost voice-live__back"
          onClick={handleExit}
        >
          ← Quitter
        </button>
        <div className="voice-live__meta">
          {topic.level > 0 ? (
            <p className="voice-live__level">Niveau {topic.level}</p>
          ) : (
            <p className="voice-live__level">Mode tuteur</p>
          )}
          <h1 className="voice-live__title">{topic.label}</h1>
        </div>
        <div className="voice-live__header-end">
          <span className="voice-live__mode" title="Gemini 2.5 Native Audio">
            Live
          </span>
          <UserMenuDropdown triggerClassName="app-header__profile voice-live__header-profile" />
        </div>
      </header>

      <div className="voice-live__main">
        <div
          className={[
            "voice-live__caption-pane",
            showTextBlock && reserveFrenchSubtitleSlot
              ? "voice-live__caption-pane--split"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-live="polite"
        >
          {showTextBlock ? (
            reserveFrenchSubtitleSlot ? (
              <>
                <div className="voice-live__caption-en">
                  <div className="voice-live__reply-block voice-live__reply-block--visible">
                    <p className="voice-live__reply">{displayEnglish}</p>
                  </div>
                </div>
                <div
                  className="voice-live__caption-fr"
                  aria-hidden={displayFrench ? undefined : true}
                >
                  <div className="voice-live__subtitle-fr-stack">
                    {displayFrench ? (
                      <p
                        className="voice-live__reply-fr voice-live__reply-fr--visible"
                        lang="fr"
                      >
                        {displayFrench}
                      </p>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <div className="voice-live__caption-en voice-live__caption-en--solo">
                <div className="voice-live__reply-block voice-live__reply-block--visible">
                  <p className="voice-live__reply">{displayEnglish}</p>
                </div>
              </div>
            )
          ) : null}
        </div>

        <div className="voice-live__main-push" aria-hidden="true" />

        <div className="voice-live__voice-cluster">
          <MicLevelMeter level={micLevel} active={listening} />

          {listening ? (
            <p className="voice-live__meter-label voice-live__meter-label--live">
              {micLevel > 0.02 ? "Je vous entends" : "Parlez…"}
            </p>
          ) : speaking ? (
            <p className="voice-live__meter-label voice-live__meter-label--live">
              Guengo parle — appuyez pour répondre
            </p>
          ) : (
            <p className="voice-live__meter-label">Niveau micro</p>
          )}
        </div>
      </div>

      <div className="voice-live__stage">
        {error ? <p className="voice-live__error">{error}</p> : null}

        <p className="voice-live__status" aria-live="polite">
          {status}
        </p>

        {showWaiting ? (
          <div className="voice-live__wave" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : (
          <div className="voice-live__wave voice-live__wave--idle" aria-hidden="true" />
        )}

        <button
          type="button"
          className={
            listening
              ? "voice-live__mic voice-live__mic--active"
              : speaking
                ? "voice-live__mic voice-live__mic--speaking"
                : "voice-live__mic"
          }
          aria-pressed={listening}
          aria-label={
            listening
              ? "Envoyer"
              : speaking
                ? "Couper et répondre"
                : "Parler à Guengo"
          }
          disabled={micDisabled}
          onClick={handleMicClick}
        >
          <span className="voice-live__mic-icon" aria-hidden="true">
            🎙️
          </span>
        </button>

        <p className="voice-live__hint">
          {openingPlaying ? (
            "Écoutez l'introduction…"
          ) : !voiceLoopReady ? (
            booting ? (
              "Préparation de la session vocale…"
            ) : (
              "Réponses vocales Gemini requises — voir message ou vérifiez GEMINI_API_KEY."
            )
          ) : voiceSupported ? (
            "Appuyez · parlez · réappuyez — réponse vocale directe"
          ) : (
            "Micro non disponible"
          )}
        </p>
      </div>
    </section>
  );
}
