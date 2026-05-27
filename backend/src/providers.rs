use crate::tts::SpeechLang;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::time::sleep;

/// Gemini 2.5 Flash Native Audio (Live API WebSocket — audio in/out only).
pub const GEMINI_LIVE_MODEL: &str = "gemini-2.5-flash-native-audio-preview-12-2025";

/// Default **`GEMINI_TTS_MODEL`** for dev tooling (`npm run warm:opening-audio -- --synthesize-if-missing`).
/// Intros served by Axum load **`.pcm` from disk only** — no server-side TTS.
pub const GEMINI_TTS_MODEL: &str = "gemini-3.1-flash-tts-preview";

/// Text model used to clean / split bilingual Live captions (never the native audio model).
pub fn gemini_caption_model() -> String {
    std::env::var("GEMINI_CAPTION_MODEL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "gemini-2.5-flash".to_string())
}

pub fn gemini_live_ready() -> bool {
    std::env::var("GEMINI_API_KEY")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
}

pub fn gemini_live_model() -> String {
    std::env::var("GEMINI_LIVE_MODEL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| GEMINI_LIVE_MODEL.into())
}

#[derive(Serialize)]
pub struct GeminiLiveAuth {
    pub token: String,
    pub model: String,
}

pub async fn gemini_live_auth() -> Option<GeminiLiveAuth> {
    let api_key = std::env::var("GEMINI_API_KEY").ok()?;
    if api_key.trim().is_empty() {
        return None;
    }

    let model = gemini_live_model();
    let expire_time = chrono::Utc::now() + chrono::Duration::minutes(30);
    let new_session_expire_time = chrono::Utc::now() + chrono::Duration::minutes(2);

    let url = format!(
        "https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key={}",
        api_key.trim()
    );

    let response = http_client()
        .post(url)
        .json(&GeminiAuthTokenBody {
            expire_time: expire_time.to_rfc3339(),
            new_session_expire_time: new_session_expire_time.to_rfc3339(),
            uses: 1,
            bidi_generate_content_setup: GeminiBidiSetup {
                model: format!("models/{model}"),
                generation_config: GeminiGenerationConfigLive {
                    response_modalities: vec!["AUDIO"],
                },
                output_audio_transcription: AudioTranscriptionConfig {},
            },
        })
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        tracing::warn!(
            status = %status,
            body = %body,
            "Gemini ephemeral token request failed"
        );
        return None;
    }

    let parsed: GeminiAuthTokenResponse = response.json().await.ok()?;
    let token = parsed.name.trim().to_string();
    if token.is_empty() {
        return None;
    }

    tracing::info!(
        live_model = %model,
        "[GEMINI_TRACK] GOOGLE HTTPS: POST …/auth_tokens ephemeral Live token (~1 HTTPS per vocal session bootstrap /api/live/config)"
    );

    Some(GeminiLiveAuth { token, model })
}

#[derive(Serialize)]
struct GeminiAuthTokenBody {
    #[serde(rename = "expireTime")]
    expire_time: String,
    #[serde(rename = "newSessionExpireTime")]
    new_session_expire_time: String,
    uses: u32,
    #[serde(rename = "bidiGenerateContentSetup")]
    bidi_generate_content_setup: GeminiBidiSetup,
}

#[derive(Serialize)]
struct GeminiBidiSetup {
    model: String,
    #[serde(rename = "generationConfig")]
    generation_config: GeminiGenerationConfigLive,
    /// Live API: enables model audio captions. Must be allowed on the ephemeral token or
    /// `BidiGenerateContentConstrained` sessions may never emit `outputTranscription`.
    #[serde(rename = "outputAudioTranscription")]
    output_audio_transcription: AudioTranscriptionConfig,
}

/// Empty JSON object `{}` for Live transcription config.
#[derive(Serialize)]
struct AudioTranscriptionConfig {}

#[derive(Serialize)]
struct GeminiGenerationConfigLive {
    #[serde(rename = "responseModalities")]
    response_modalities: Vec<&'static str>,
}

#[derive(Deserialize)]
struct GeminiAuthTokenResponse {
    name: String,
}

pub fn speechify_enabled() -> bool {
    let enabled = std::env::var("SPEECHIFY_ENABLED")
        .map(|value| matches!(value.trim().to_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false);
    enabled && speechify_api_key().is_some()
}

fn speechify_api_key() -> Option<String> {
    std::env::var("SPEECHIFY_API_KEY")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn speechify_voice_id(lang: SpeechLang) -> String {
    let key = match lang {
        SpeechLang::English => "SPEECHIFY_VOICE_ID",
        SpeechLang::French => "SPEECHIFY_VOICE_ID_FR",
    };
    std::env::var(key)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| match lang {
            SpeechLang::English => "george".into(),
            SpeechLang::French => "george".into(),
        })
}

#[derive(Serialize)]
struct SpeechifySpeechRequest<'a> {
    input: &'a str,
    voice_id: String,
    audio_format: &'static str,
    language: &'static str,
    model: &'static str,
}

pub async fn speechify_tts(text: &str, lang: SpeechLang) -> Option<Vec<u8>> {
    let api_key = speechify_api_key()?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }

    let response = http_client()
        .post("https://api.speechify.ai/v1/audio/speech")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Accept", "audio/mpeg")
        .json(&SpeechifySpeechRequest {
            input: trimmed,
            voice_id: speechify_voice_id(lang),
            audio_format: "mp3",
            language: lang.as_api_code(),
            model: "simba-english",
        })
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        tracing::warn!(status = %status, body = %body, "Speechify TTS failed");
        return None;
    }

    response.bytes().await.ok().map(|bytes| bytes.to_vec())
}

pub fn gemini_tts_model() -> String {
    std::env::var("GEMINI_TTS_MODEL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| GEMINI_TTS_MODEL.into())
}

// --- Gemini text model: clean bilingual captions from Live transcripts -----------------------------

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SubtitleLines {
    pub english: String,
    #[serde(default)]
    pub french: Option<String>,
}

#[derive(Serialize)]
struct GeminiCaptionRequest {
    #[serde(rename = "systemInstruction")]
    system_instruction: GeminiCaptionSysInst,
    contents: Vec<GeminiCaptionContent>,
    #[serde(rename = "generationConfig")]
    generation_config: GeminiCaptionGenConfig,
}

#[derive(Serialize)]
struct GeminiCaptionSysInst {
    parts: Vec<GeminiCaptionSysPart>,
}

#[derive(Serialize)]
struct GeminiCaptionSysPart {
    text: &'static str,
}

#[derive(Serialize)]
struct GeminiCaptionContent {
    role: &'static str,
    parts: Vec<GeminiCaptionUserPart>,
}

#[derive(Serialize)]
struct GeminiCaptionUserPart {
    text: String,
}

#[derive(Serialize)]
struct GeminiCaptionGenConfig {
    temperature: f32,
    #[serde(rename = "maxOutputTokens")]
    max_output_tokens: u32,
    #[serde(rename = "responseMimeType")]
    response_mime_type: &'static str,
    /// Forces both lines so Live conversation subtitles always get a French row (same as welcome).
    #[serde(rename = "responseSchema", skip_serializing_if = "Option::is_none")]
    response_schema: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct GeminiCaptionOuter {
    candidates: Option<Vec<GeminiCaptionCand>>,
}

#[derive(Deserialize)]
struct GeminiCaptionCand {
    content: Option<GeminiCaptionContentOut>,
}

#[derive(Deserialize)]
struct GeminiCaptionContentOut {
    parts: Option<Vec<GeminiCaptionPartOut>>,
}

#[derive(Deserialize)]
struct GeminiCaptionPartOut {
    text: Option<String>,
}

const CAPTION_SYSTEM: &str = "Guengo live tutor — on-screen captions only.\n\
You receive rough transcripts/snippets from Gemini Live (often English audio transcription).\n\
The learner may have spoken English or French, but tutor output must always caption as British English primary with Parisian French translating that English underneath — never substitute a French-forward line.\n\
Derive one clean English subtitle line; the French field must be a Parisian French translation of THAT English line only — not a separate paraphrase of mixed raw text.\n\
Never put Spanish, Portuguese, Mandarin, Hindi, Arabic, German, Korean, or any third language into either field — only standard British tutor English plus Parisian French that translates that English. If raw contains odd tokens from bad ASR, prefer normalising to the intended English teaching line.\n\
Return JSON matching the schema: both \"english\" and \"french\" are required strings.";

const TRANSLATE_SUBTITLE_SYSTEM: &str = "Guengo subtitle translator. Output JSON only. Parisian French, brief, same teaching tone as the English line.";

/// Retries help with transient Gemini 503/429 on generateContent (often seen as ~2–8s extra delay per failed turn).
const GEMINI_CAPTION_LLM_ATTEMPTS: u32 = 3;

/// Build French subtitle line(s) via a standard text Gemini model (`GEMINI_CAPTION_MODEL`, default `gemini-2.5-flash`).
pub async fn gemini_subtitles_llm(raw: &str) -> Option<SubtitleLines> {
    for attempt in 0..GEMINI_CAPTION_LLM_ATTEMPTS {
        if attempt > 0 {
            let delay_ms = 200u64.saturating_mul(1u64 << (attempt - 1));
            tracing::info!(
                attempt,
                delay_ms,
                "[GEMINI_TRACK] Caption LLM outer retry (wait then generateContent again)"
            );
            sleep(Duration::from_millis(delay_ms.min(1500))).await;
        }
        if let Some(lines) = try_gemini_subtitles_llm_once(raw).await {
            if !lines.english.is_empty() {
                return Some(lines);
            }
        }
    }
    None
}

async fn try_gemini_subtitles_llm_once(raw: &str) -> Option<SubtitleLines> {
    let api_key = std::env::var("GEMINI_API_KEY").ok()?;
    if api_key.trim().is_empty() {
        return None;
    }
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let model = gemini_caption_model();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={}",
        api_key.trim()
    );

    tracing::info!(
        caption_model = %model,
        raw_chars = trimmed.len(),
        "[GEMINI_TRACK] GOOGLE HTTPS: POST …/generateContent caption LLM (~1 HTTPS per tutor turn subtitle polish)"
    );

    let user_prompt = format!(
        "Return JSON with keys english and french (both non-empty when there is anything to caption).\n\
- english: one clean subtitle line — the tutor's English only — derived from raw below.\n\
- french: translate THAT english line into natural Parisian French (subtitle style). french must correspond to english, not stray French from raw.\n\
Only fix obvious ASR errors on the English; stay faithful to what was taught.\n\n\
Raw:\n{trimmed}"
    );

    let schema = caption_response_schema_json();
    let body = caption_request_body(&user_prompt, Some(schema));

    let response = http_client()
        .post(&url)
        .json(&body)
        .send()
        .await
        .ok()?;

    let response = if response.status().is_success() {
        response
    } else {
        let status = response.status();
        let err_body = response.text().await.unwrap_or_default();
        let preview = err_body.chars().take(768).collect::<String>();
        tracing::warn!(
            status = %status,
            body = %preview,
            "Gemini caption generateContent failed (retrying without responseSchema)"
        );
        tracing::info!(
            "[GEMINI_TRACK] Caption LLM retry: second HTTPS POST …/generateContent (no schema)"
        );
        let body_plain = caption_request_body(&user_prompt, None);
        http_client()
            .post(&url)
            .json(&body_plain)
            .send()
            .await
            .ok()?
    };

    if !response.status().is_success() {
        let status = response.status();
        let body_txt = response.text().await.unwrap_or_default();
        let preview = body_txt.chars().take(1536).collect::<String>();
        tracing::warn!(status = %status, body = %preview, "Gemini caption LLM generateContent failed");
        return None;
    }

    let parsed: GeminiCaptionOuter = response.json().await.ok()?;
    let text = parsed
        .candidates?
        .into_iter()
        .filter_map(|c| c.content)
        .flat_map(|c| c.parts.unwrap_or_default())
        .find_map(|p| p.text)?;

    let mut lines = parse_subtitle_llm_json(&text)?;
    lines.english = lines.english.trim().to_string();
    lines.french = lines.french.and_then(|s| {
        let t = s.trim().to_string();
        (!t.is_empty()).then_some(t)
    });
    if !lines.english.is_empty() && lines.french.is_none() {
        tracing::info!(
            "[GEMINI_TRACK] Caption LLM: EN→FR translate pass (~1 HTTPS) — bilingual pair missing french"
        );
        lines.french =
            gemini_translate_subtitle_line_en_to_fr(&lines.english).await;
    }
    if !lines.english.is_empty() && lines.french.is_none() {
        tracing::warn!(
            english_preview = %lines.english.chars().take(120).collect::<String>(),
            "Could not derive French subtitle (caption + translate fallback failed)"
        );
    }
    tracing::info!(
        en_chars = lines.english.len(),
        fr_chars = lines.french.as_ref().map(|s| s.len()).unwrap_or(0),
        "[GEMINI_TRACK] Caption LLM OK (see prior HTTPS POST log(s))"
    );
    (!lines.english.is_empty()).then_some(lines)
}

#[derive(Debug, Deserialize)]
struct TranslateSubtitleFrench {
    french: String,
}

/// Second Gemini text call: translates the finalized English caption only (Parisian FR).
async fn gemini_translate_subtitle_line_en_to_fr(english: &str) -> Option<String> {
    let api_key = std::env::var("GEMINI_API_KEY").ok()?;
    if api_key.trim().is_empty() {
        return None;
    }
    let en_line = english.trim();
    if en_line.is_empty() {
        return None;
    }

    let model = gemini_caption_model();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={}",
        api_key.trim()
    );

    tracing::info!(
        caption_model = %model,
        en_chars = en_line.len(),
        "[GEMINI_TRACK] GOOGLE HTTPS: POST …/generateContent subtitle EN→FR translate"
    );

    let user_prompt = format!(
        "Return JSON {{ \"french\": \"…\" }}. Translate this English subtitle into natural Parisian French for subtitles. Preserve brevity and teaching tone.\n\nEnglish:\n{en_line}"
    );

    let schema = translate_only_response_schema_json();
    let body = translate_only_request_body(&user_prompt, Some(schema));

    let response = http_client()
        .post(&url)
        .json(&body)
        .send()
        .await
        .ok()?;

    let response = if response.status().is_success() {
        response
    } else {
        let status = response.status();
        let err_body = response.text().await.unwrap_or_default();
        let preview = err_body.chars().take(768).collect::<String>();
        tracing::warn!(
            status = %status,
            body = %preview,
            "Gemini subtitle translate generateContent failed (retrying without responseSchema)"
        );
        tracing::info!(
            "[GEMINI_TRACK] Subtitle translate retry: HTTPS POST …/generateContent (no schema)"
        );
        let body_plain = translate_only_request_body(&user_prompt, None);
        http_client()
            .post(&url)
            .json(&body_plain)
            .send()
            .await
            .ok()?
    };

    if !response.status().is_success() {
        let status = response.status();
        let body_txt = response.text().await.unwrap_or_default();
        let preview = body_txt.chars().take(1536).collect::<String>();
        tracing::warn!(
            status = %status,
            body = %preview,
            "Gemini subtitle translate generateContent failed"
        );
        return None;
    }

    let parsed: GeminiCaptionOuter = response.json().await.ok()?;
    let text = parsed
        .candidates?
        .into_iter()
        .filter_map(|c| c.content)
        .flat_map(|c| c.parts.unwrap_or_default())
        .find_map(|p| p.text)?;

    parse_translate_only_llm_json(&text)
}

fn translate_only_response_schema_json() -> serde_json::Value {
    json!({
        "type": "object",
        "properties": {
            "french": {
                "type": "string",
                "description": "Parisian French translation of the English subtitle."
            }
        },
        "required": ["french"]
    })
}

fn translate_only_request_body(
    user_prompt: &str,
    response_schema: Option<serde_json::Value>,
) -> GeminiCaptionRequest {
    GeminiCaptionRequest {
        system_instruction: GeminiCaptionSysInst {
            parts: vec![GeminiCaptionSysPart {
                text: TRANSLATE_SUBTITLE_SYSTEM,
            }],
        },
        contents: vec![GeminiCaptionContent {
            role: "user",
            parts: vec![GeminiCaptionUserPart {
                text: user_prompt.to_string(),
            }],
        }],
        generation_config: GeminiCaptionGenConfig {
            temperature: 0.2,
            max_output_tokens: 256,
            response_mime_type: "application/json",
            response_schema,
        },
    }
}

fn parse_translate_only_llm_json(blob: &str) -> Option<String> {
    let t = blob.trim();
    if let Ok(v) = serde_json::from_str::<TranslateSubtitleFrench>(t) {
        let french = v.french.trim().to_string();
        return (!french.is_empty()).then_some(french);
    }
    let start = t.find('{')?;
    let end = t.rfind('}')?;
    (end > start).then(|| &t[start..=end])
        .and_then(|slice| serde_json::from_str::<TranslateSubtitleFrench>(slice).ok())
        .and_then(|v| {
            let french = v.french.trim().to_string();
            (!french.is_empty()).then_some(french)
        })
}

fn caption_response_schema_json() -> serde_json::Value {
    // OpenAPI-style types (not protobuf OBJECT/STRING) — matches ai.google.dev structured JSON examples.
    json!({
        "type": "object",
        "properties": {
            "english": {
                "type": "string",
                "description": "Clean English subtitle line from the tutor."
            },
            "french": {
                "type": "string",
                "description": "Parisian French translation for the same line."
            }
        },
        "required": ["english", "french"]
    })
}

fn caption_request_body(
    user_prompt: &str,
    response_schema: Option<serde_json::Value>,
) -> GeminiCaptionRequest {
    GeminiCaptionRequest {
        system_instruction: GeminiCaptionSysInst {
            parts: vec![GeminiCaptionSysPart {
                text: CAPTION_SYSTEM,
            }],
        },
        contents: vec![GeminiCaptionContent {
            role: "user",
            parts: vec![GeminiCaptionUserPart {
                text: user_prompt.to_string(),
            }],
        }],
        generation_config: GeminiCaptionGenConfig {
            temperature: 0.15,
            max_output_tokens: 512,
            response_mime_type: "application/json",
            response_schema,
        },
    }
}

fn parse_subtitle_llm_json(blob: &str) -> Option<SubtitleLines> {
    let t = blob.trim();
    if let Ok(v) = serde_json::from_str::<SubtitleLines>(t) {
        return Some(v);
    }
    let start = t.find('{')?;
    let end = t.rfind('}')?;
    (end > start).then(|| &t[start..=end])
        .and_then(|slice| serde_json::from_str::<SubtitleLines>(slice).ok())
}

fn http_client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .pool_max_idle_per_host(4)
            .tcp_keepalive(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| Client::new())
    })
}
