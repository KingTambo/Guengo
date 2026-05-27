//! Intro PCM — **files only at runtime**. No Gemini / network from this module when serving intros.
//!
//! Resolution order (`opening_audio_base64`):
//! 1. **Bundled** — `frontend/public/audio/openings/<topic_id>.pcm`
//! 2. **Local cache** — `backend/cache/audio/<topic_id>.pcm` (gitignored; optional manual drop-in)
//!
//! To **generate** new PCM for git, run `npm run warm:opening-audio` (writes under `frontend/public/…`)
//! — that script may call Gemini from **Node** with `GEMINI_API_KEY` once if you pass `--synthesize-if-missing`,
//! never from the Axum server.
//!
//! **Opening captions** (must match PCM): `<topic_id>.opening.json` next to the PCM in the same dirs.
//! If missing on disk, on-screen EN is derived from `welcome` (text only — no HTTP).
use crate::tts;
use crate::tutor;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Deserialize;
use std::path::{Path, PathBuf};

fn cache_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("cache/audio")
}

fn cache_path(topic_id: &str) -> PathBuf {
    cache_dir().join(format!("{topic_id}.pcm"))
}

/// Directories to check for committed PCM (see `npm run warm:opening-audio`).
/// Repo paths are tried before `GUENGO_PUBLIC_DIR` so committed `*.opening.json` / `*.pcm`
/// win over a stale override directory.
fn bundled_openings_dirs() -> Vec<PathBuf> {
    let mut out = Vec::new();
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for rel in ["../frontend/public/audio/openings", "frontend/public/audio/openings"] {
        out.push(manifest.join(rel));
    }
    if let Ok(dir) = std::env::var("GUENGO_PUBLIC_DIR") {
        out.push(PathBuf::from(dir).join("audio/openings"));
    }
    out
}

fn bundled_pcm_candidates(topic_id: &str) -> Vec<PathBuf> {
    bundled_openings_dirs()
        .into_iter()
        .map(|d| d.join(format!("{topic_id}.pcm")))
        .collect()
}

fn bundled_opening_json_paths(topic_id: &str) -> Vec<PathBuf> {
    bundled_openings_dirs()
        .into_iter()
        .map(|d| d.join(format!("{topic_id}.opening.json")))
        .collect()
}

fn cache_opening_json_path(topic_id: &str) -> PathBuf {
    cache_dir().join(format!("{topic_id}.opening.json"))
}

#[derive(Debug, Deserialize)]
struct OpeningCaptionFileDto {
    english: String,
    #[serde(default)]
    french: Option<String>,
}

/// English line that Intro PCM was generated from (+ optional subtitle translation).
#[derive(Debug, Clone)]
pub struct OpeningCaptions {
    pub english: String,
    pub french: Option<String>,
}

async fn read_opening_caption_file(path: &Path) -> Option<OpeningCaptions> {
    let text = tokio::fs::read_to_string(path).await.ok()?;
    let dto: OpeningCaptionFileDto = serde_json::from_str(&text).ok()?;
    let english = dto.english.trim().to_string();
    if english.is_empty() {
        return None;
    }
    let french = dto
        .french
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    Some(OpeningCaptions { english, french })
}

/// On-screen opening lines — prefers `*.opening.json`, else derives English from `welcome` (local text only).
pub async fn opening_display_captions(topic_id: &str) -> OpeningCaptions {
    for path in bundled_opening_json_paths(topic_id) {
        if let Some(cap) = read_opening_caption_file(&path).await {
            tracing::info!(
                topic_id,
                source = %path.display(),
                "[GEMINI_TRACK] opening_display SOURCE=bundled_opening_json"
            );
            return cap;
        }
    }

    let cache_json = cache_opening_json_path(topic_id);
    if let Some(cap) = read_opening_caption_file(&cache_json).await {
        tracing::info!(
            topic_id,
            source = "backend/cache/audio",
            "[GEMINI_TRACK] opening_display SOURCE=local_opening_json"
        );
        return cap;
    }

    let welcome = tutor::welcome_for_topic(topic_id);
    let english = tts::english_tts_lines(&welcome).join(" ");
    OpeningCaptions {
        english,
        french: None,
    }
}

async fn read_pcm_file_b64(path: &Path) -> Option<(String, usize)> {
    if !path.is_file() {
        return None;
    }
    let bytes = tokio::fs::read(path).await.ok()?;
    if bytes.is_empty() {
        return None;
    }
    let len = bytes.len();
    Some((STANDARD.encode(bytes), len))
}

/// Returns Base64-encoded intro PCM — **disk only**. No Gemini.
pub async fn opening_audio_base64(topic_id: &str) -> Option<String> {
    if !tutor::uses_cached_opening(topic_id) {
        return None;
    }

    for path in bundled_pcm_candidates(topic_id) {
        if let Some((encoded, pcm_bytes)) = read_pcm_file_b64(&path).await {
            tracing::info!(
                topic_id,
                pcm_bytes,
                source = %path.display(),
                "[GEMINI_TRACK] opening_intro SOURCE=bundled_pcm (disk only)"
            );
            return Some(encoded);
        }
    }

    let path = cache_path(topic_id);
    if let Some((encoded, pcm_bytes)) = read_pcm_file_b64(&path).await {
        tracing::info!(
            topic_id,
            pcm_bytes,
            source = "backend/cache/audio",
            "[GEMINI_TRACK] opening_intro SOURCE=local_cache (disk only)"
        );
        return Some(encoded);
    }

    tracing::warn!(
        topic_id,
        "[GEMINI_TRACK] opening_intro MISSING — no .pcm under frontend/public/audio/openings or backend/cache/audio; npm run warm:opening-audio (with optional --synthesize-if-missing) to write files",
    );
    None
}
