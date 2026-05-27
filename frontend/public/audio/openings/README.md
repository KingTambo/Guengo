# Bundled opening audio (PCM)

Raw **24 kHz mono PCM** files named `<topic_id>.pcm` (e.g. `conversation.pcm`).

The SPA loads **`/audio/openings/<topic_id>.pcm`** from this folder (Vite / static hosting) **before** calling `/api/live/opening-audio`. So the intro can still play when the Rust API is down but the frontend dev server (or CDN) is serving `public/`.

Beside each one, **`<topic_id>.opening.json`** fixes the intro **on-screen** English and Parisian French so it matches what the PCM plays:

```json
{
  "english": "… exact copy of spoken intro …",
  "french": "French subtitle for learners"
}
```

If you change **`welcome`** wording in Rust, regenerate **PCM + JSON** (`npm run warm:opening-audio`) so spoken audio and captions stay aligned.

The **Rust server only reads these files at runtime** — it never calls Gemini to generate intro audio during `GET /api/live/opening-audio`.

## Generate / refresh

1. Keep the API running (`npm run dev` or Rust only — no Gemini key needed to **serve** existing PCM).

2. From the repo root:

   ```bash
   npm run warm:opening-audio
   ```

   If PCM is missing and you need a **one-shot** Gemini TTS on your laptop (calls Google from **Node**, not from the intros route):

   ```bash
   GEMINI_API_KEY=your_key npm run warm:opening-audio -- --synthesize-if-missing
   ```

3. Commit `*.pcm` and matching `*.opening.json`.

Optional:

- `GUENGO_API_BASE` — default `http://127.0.0.1:8080`
- `GUENGO_OPENING_TOPICS` — comma-separated topic ids (default `conversation,L01-section-1`)
- `GUENGO_WARM_FORCE_OPENING_JSON=1` — rewrite `*.opening.json` … (same as `--force-opening-json`)
- `GEMINI_TTS_MODEL` — only for `--synthesize-if-missing` (default mirrors backend)
- `GUENGO_WARM_SYNTHESIZE_IF_MISSING=1` — same effect as `--synthesize-if-missing`

If you use **`GUENGO_PUBLIC_DIR`**, repo **`frontend/public/audio/openings`** is checked **first**, so stale copies under `GUENGO_PUBLIC_DIR` don’t override committed `*.pcm` / `*.opening.json`.
