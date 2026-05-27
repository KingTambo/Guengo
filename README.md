# Guengo

Web app: **React** SPA + **Rust/Axum** backend. Voice tutoring powered exclusively by **Gemini 2.5 Flash Native Audio** (Live API).

## Layout

| Path | Role |
|------|------|
| `frontend/` | React + TypeScript; esbuild writes `public/dist/app.js` |
| `backend/` | Axum on `http://127.0.0.1:8080`: Live API config + static files |

## Environment

Copy **`.env.example`** to **`.env`** at the repo root:

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Google Gemini API key for Live API ephemeral tokens |
| `GEMINI_LIVE_MODEL` | Optional override (default: `gemini-2.5-flash-native-audio-preview-12-2025`) |
| `GEMINI_CAPTION_MODEL` | Optional — text Gemini model for `/api/live/subtitles` after each tutor turn (default: `gemini-2.5-flash`; `gemini-2.0-flash` is discontinued for many new keys) |
| `SUPABASE_URL` | Optional — URL du projet ([Supabase](https://supabase.com)) pour « Continuer avec Google » dans l’auth |
| `SUPABASE_ANON_KEY` | Optional — clé **anon** (publique) ; activer Google dans Supabase Auth et autoriser la redirection vers `/app` |

Lorsque **les deux** variables sont présentes, `/app` (**tuteur / session vocale**) n’est accessible **qu’aux utilisateurs connectés** (magic link e-mail ou Google). Une ligne correspondante est créée dans la table Postgres **`profiles`** pour chaque compte créé dans `auth.users`. Voir **`supabase/migrations/20260526120000_profiles_auth_sync.sql`**.

The API loads **`.env`** when you run **`cargo run`** from **`backend/``.

### Observability (`GEMINI_TRACK`)

On startup and during sessions the API **`info!`** logs lines containing **`GEMINI_TRACK`**, for example:

| Log | Meaning |
|-----|--------|
| `opening_intro SOURCE=bundled_pcm` | Intro read from **`frontend/public/audio/openings`** — **no** Gemini HTTPS for that file |
| `opening_display SOURCE=bundled_opening_json` | Intro EN/FR captions from **`*.opening.json`** next to the PCM |
| `opening_intro MISSING` | No `<topic>.pcm` on disk for that topic |
| `GET /api/live/session-shell` | Topic shell + captions + prompts — **no** token; supports intro PCM without Gemini |
| `POST …/auth_tokens` | **~1 HTTPS** per **`GET /api/live/config`** (session bootstrap) |
| `caption LLM` / `/api/live/subtitles` | English cleanup + FR translation (**~1–2 HTTPS**) per subtitle polish turn |

**Live WebSocket** audio after connect is billed by Gemini **outside** this server’s HTTP tracing (browser SDK).

Set **`RUST_LOG=guengo_api=debug,tower_http=debug`** when you want more Rust noise alongside these lines.

### Cached intro audio (disk only — no Gemini on request path)

Committed **`frontend/public/audio/openings/<topic>.pcm`** (+ optional **`*.opening.json`**) load from disk via **`GET /api/live/opening-audio`** — **no Gemini call** during that HTTP request.

Missing PCM for a bundled topic ⇒ **503** until you add files. To create or refresh them:

```bash
npm run warm:opening-audio
```

If you still have no PCM, run with Gemini **once from your machine only** (not the Axum intros path):

```bash
GEMINI_API_KEY=your_key npm run warm:opening-audio -- --synthesize-if-missing
```

Then commit **`*.pcm`** and **`*.opening.json`**. See **`frontend/public/audio/openings/README.md`**.

## Development

From the repository root:

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:8080**, pick a session, and talk via the microphone.

## How it works

1. Browser calls **`GET /api/live/session-shell`** (topic + focus): captions, welcome text, `cached_opening`, and **`gemini_live_ready`** — **no** Gemini token; reading **bundled** `frontend/public/audio/openings/<topic>.pcm` for the intro stays on disk (**no** Gemini for that PCM).
2. If the topic ships a **`*.pcm`**, **`GET /api/live/opening-audio`** returns base64 PCM **only from disk** (`frontend/public/audio/openings` or `backend/cache/audio`). Missing file ⇒ HTTP 503; no Gemini on that handler.
3. **`GET /api/live/config`** mints an ephemeral Gemini token (**requires `GEMINI_API_KEY`**). The microphone stays disabled until the Live WebSocket connects (`voiceLoopReady` in the SPA).
4. Browser opens Gemini Live (**`@google/genai`**). Mic sends 16 kHz PCM; tutor replies at 24 kHz. Rough transcripts merge for live English captions; on each **`turnComplete`**, **`POST /api/live/subtitles`** polishes EN + FR. Cached-opening copy uses **`*.opening.json`** (no Caption LLM for intros). Duplicate raw captions in-tab skip extra subtitle calls.

No Mistral, Speechify, or REST chat for the voice loop — captions use a lightweight **Gemini text** REST call keyed off the same **`GEMINI_API_KEY`**.

### English-only tutor speech vs French learner input

- **Understand French, speak English.** The learner may speak **French or English**; the tutor’s **spoken** replies must stay **British English**.
- Google’s **native audio** Live models can **automatically mirror** the learner’s spoken language for **synthesis**; `speechConfig.languageCode` is **often ignored** for native-audio output. Prompting reduces but does **not guarantee** English-only speech.
- **`speechConfig.languageCode`** (`en-GB` in [`frontend/src/api/geminiLive.ts`](frontend/src/api/geminiLive.ts)) is sent **only when opening the Live WebSocket** — not when minting the ephemeral token (`/v1alpha/auth_tokens` **rejects** a `speechConfig` field inside `bidiGenerateContentSetup`).
- If French speech persists after tightening prompts, **try another `GEMINI_LIVE_MODEL`** (see [Gemini Live / models docs](https://ai.google.dev/gemini-api/docs/live-api)): some **non‑native‑audio** Live stacks respect output `speechConfig.language_code` better (trade-offs on voice or latency — validate in AI Studio first).
- **Dev:** after each tutor `turnComplete`, the browser emits `live.turn.outputTranscriptSnapshot` (subtitle logger) from raw `outputAudioTranscription`; French orthography accents there often correlate with French **synthesis**, even when `/api/live/subtitles` still shows polished English captions.
