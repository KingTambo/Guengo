/**
 * Copies opening intro PCM from `GET /api/live/opening-audio` (pure disk reads on the API)
 * into `frontend/public/audio/openings/<topic_id>.pcm` and refreshes caption sidecars.
 *
 * **`--synthesize-if-missing`**: If the PCM file is absent and `GEMINI_API_KEY` is set in the env,
 * this script generates audio via **Gemini TTS REST from Node** (not from the Rust server intro path),
 * then writes `.pcm`; then the normal GET succeeds.
 *
 * Prereqs: typically `GUENGO_API_BASE` + API running (`npm run dev` or Rust only).
 * Session shell + opening-audio endpoints do **not** require Gemini in production.
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const base = process.env.GUENGO_API_BASE ?? "http://127.0.0.1:8080";
const topics = (process.env.GUENGO_OPENING_TOPICS ?? "conversation,L01-section-1")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const outDir = path.join(process.cwd(), "frontend", "public", "audio", "openings");

const forceOpeningJson =
  process.argv.includes("--force-opening-json") ||
  process.env.GUENGO_WARM_FORCE_OPENING_JSON === "1";

const synthesizeIfMissing =
  process.argv.includes("--synthesize-if-missing") ||
  process.env.GUENGO_WARM_SYNTHESIZE_IF_MISSING === "1";

/** Gemini generateContent AUDIO — standalone dev helper (Rust server never hits this path for intros). */
async function synthesizePcmWithGemini(englishPlain) {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "`--synthesize-if-missing` needs GEMINI_API_KEY in env to call Gemini TTS from Node",
    );
  }
  const model = process.env.GEMINI_TTS_MODEL ?? "gemini-3.1-flash-tts-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const text = englishPlain.trim();
  if (!text) throw new Error("empty English prompt for Gemini TTS");

  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini TTS HTTP ${res.status}: ${t.slice(0, 512)}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  let b64 = null;
  for (const p of parts) {
    const d = p.inlineData?.data ?? p.inline_data?.data;
    if (d) {
      b64 = d;
      break;
    }
  }
  if (!b64)
    throw new Error("Gemini TTS JSON missing audio inlineData in candidates[0].content.parts");
  return Buffer.from(String(b64), "base64");
}

async function readEnglishForTts(topicId, baseUrl) {
  const url = `${baseUrl}/api/live/session-shell?topic_id=${encodeURIComponent(topicId)}`;
  const sr = await fetch(url);
  if (!sr.ok) {
    throw new Error(`session-shell HTTP ${sr.status} for ${topicId}`);
  }
  const s = await sr.json();
  const en =
    (typeof s.opening_caption_english === "string" && s.opening_caption_english.trim()) ||
    (typeof s.welcome === "string" && s.welcome.trim()) ||
    "";
  if (!en) throw new Error(`no English caption for ${topicId} from session-shell`);
  return en;
}

async function writeOpeningCaptionSidecar(topicId, baseUrl) {
  const sidecarPath = path.join(outDir, `${topicId}.opening.json`);

  if (!forceOpeningJson) {
    try {
      const txt = await readFile(sidecarPath, "utf8");
      const o = JSON.parse(txt);
      const en = typeof o.english === "string" ? o.english.trim() : "";
      const fr = typeof o.french === "string" ? o.french.trim() : "";
      if (en && fr) {
        console.log(
          `[warm-opening-audio] ${topicId}: skipping caption sidecar (already has EN+FR at ${topicId}.opening.json; use --force-opening-json or GUENGO_WARM_FORCE_OPENING_JSON=1 to regenerate)`,
        );
        return;
      }
    } catch {
      /* write below */
    }
  }

  const shellUrl = `${baseUrl}/api/live/session-shell?topic_id=${encodeURIComponent(topicId)}`;
  const shellRes = await fetch(shellUrl);
  if (!shellRes.ok) {
    console.warn(`[warm-opening-audio] ${topicId}: session-shell HTTP ${shellRes.status} — skip caption sidecar`);
    return;
  }
  const shell = await shellRes.json();
  const english =
    (typeof shell.opening_caption_english === "string" && shell.opening_caption_english.trim()) ||
    (typeof shell.welcome === "string" && shell.welcome.trim()) ||
    "";

  if (!english) {
    console.warn(`[warm-opening-audio] ${topicId}: no English line — skip ${topicId}.opening.json`);
    return;
  }

  let french =
    typeof shell.opening_caption_french === "string" && shell.opening_caption_french.trim().length > 0
      ? shell.opening_caption_french.trim()
      : null;

  if (!french && (process.env.GEMINI_API_KEY ?? "").trim()) {
    const subRes = await fetch(`${baseUrl}/api/live/subtitles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: english }),
    });
    if (subRes.ok) {
      const sub = await subRes.json();
      if (typeof sub.french === "string" && sub.french.trim().length > 0) {
        french = sub.french.trim();
      }
    } else {
      console.warn(
        `[warm-opening-audio] ${topicId}: subtitles HTTP ${subRes.status} — committing English-only sidecar`,
      );
    }
  } else if (!french) {
    console.warn(
      `[warm-opening-audio] ${topicId}: no French in shell — set GEMINI_API_KEY + running API for /api/live/subtitles, else English-only sidecar`,
    );
  }

  const payload = french ? { english, french } : { english };
  await writeFile(sidecarPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`[warm-opening-audio] wrote ${sidecarPath}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  let failed = false;

  for (const topicId of topics) {
    const url = `${base}/api/live/opening-audio?topic_id=${encodeURIComponent(topicId)}`;
    let res = await fetch(url);

    if (!res.ok && synthesizeIfMissing) {
      try {
        console.log(`[warm-opening-audio] ${topicId}: missing/unavailable PCM — Gemini TTS (Node) …`);
        const english = await readEnglishForTts(topicId, base);
        const buf = await synthesizePcmWithGemini(english);
        await mkdir(outDir, { recursive: true });
        const dest = path.join(outDir, `${topicId}.pcm`);
        await writeFile(dest, buf);
        console.log(`[warm-opening-audio] wrote ${dest} (${buf.length} bytes) via Node TTS`);

        const cacheUrl = `${base}/api/live/opening-audio?topic_id=${encodeURIComponent(topicId)}`;
        res = await fetch(cacheUrl);
      } catch (e) {
        console.error(`[warm-opening-audio] ${topicId}: synthesize failed`, e.message ?? e);
        failed = true;
        continue;
      }
    }

    if (!res.ok) {
      console.error(
        `[warm-opening-audio] ${topicId}: HTTP ${res.status} ${res.statusText} — commit a .pcm or run with GEMINI_API_KEY + --synthesize-if-missing`,
      );
      failed = true;
      continue;
    }

    const data = await res.json();
    const audioB64 = typeof data.audio === "string" ? data.audio : "";
    if (!audioB64) {
      console.error(`[warm-opening-audio] ${topicId}: empty audio in JSON`);
      failed = true;
      continue;
    }
    const buf = Buffer.from(audioB64, "base64");
    const dest = path.join(outDir, `${topicId}.pcm`);
    await writeFile(dest, buf);
    console.log(`[warm-opening-audio] wrote ${dest} (${buf.length} bytes, ${data.sample_rate ?? "?"} Hz)`);

    try {
      await writeOpeningCaptionSidecar(topicId, base);
    } catch (err) {
      console.error(`[warm-opening-audio] ${topicId}: sidecar failed`, err);
      failed = true;
    }
  }

  if (failed) {
    console.error("[warm-opening-audio] Finished with errors.");
    process.exit(1);
  }
  console.log("[warm-opening-audio] Done. Commit *.pcm / *.opening.json — runtime serves PCM from disk only.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
