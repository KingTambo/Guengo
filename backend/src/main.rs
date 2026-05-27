use axum::{
    extract::Query,
    http::StatusCode,
    routing::{get, get_service, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod focus_topics;
mod opening_audio;
mod providers;
mod stripe;
mod tts;
mod tutor;

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

#[derive(Serialize)]
struct AppConfigResponse {
    gemini_live: bool,
    gemini_live_model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    supabase_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    supabase_anon_key: Option<String>,
    /// Clé publique Stripe (frontend / futur Elements) — jamais la clé secrète.
    #[serde(skip_serializing_if = "Option::is_none")]
    stripe_publishable_key: Option<String>,
    /// Paywall actif seulement si STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET et SUPABASE_SERVICE_ROLE_KEY sont définis.
    stripe_paywall_enabled: bool,
}

#[derive(Debug, Deserialize)]
struct LiveConfigQuery {
    topic_id: String,
    #[serde(default)]
    focus: Option<String>,
}

#[derive(Serialize)]
struct LiveConfigResponse {
    token: String,
    model: String,
    system_instruction: String,
    welcome: String,
    step_count: usize,
    cached_opening: bool,
    /// Exact English the intro PCM was synthesized from (+ optional subtitle). From `*.opening.json` when present.
    #[serde(skip_serializing_if = "Option::is_none")]
    opening_caption_english: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    opening_caption_french: Option<String>,
    focus_topics: Vec<focus_topics::FocusTopic>,
}

/// Topic metadata + captions + prompts **without** minting an ephemeral Gemini token —
/// lets the browser play **bundled** intro PCM (`/api/live/opening-audio`) before `GEMINI_API_KEY`
/// is configured.
#[derive(Serialize)]
struct LiveSessionShellResponse {
    welcome: String,
    cached_opening: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    opening_caption_english: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    opening_caption_french: Option<String>,
    step_count: usize,
    system_instruction: String,
    gemini_live_ready: bool,
    focus_topics: Vec<focus_topics::FocusTopic>,
}

#[derive(Debug, Deserialize)]
struct TopicIdQuery {
    topic_id: String,
}

#[derive(Serialize)]
struct FocusTopicsBody {
    topics: Vec<focus_topics::FocusTopic>,
}

#[derive(Debug, Deserialize)]
struct OpeningAudioQuery {
    topic_id: String,
}

#[derive(Serialize)]
struct OpeningAudioResponse {
    audio: String,
    sample_rate: u32,
}

#[derive(Debug, Deserialize)]
struct LiveNudgeQuery {
    topic_id: String,
    step: usize,
    #[serde(default)]
    focus: Option<String>,
}

#[derive(Serialize)]
struct LiveNudgeResponse {
    nudge: String,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

pub(crate) fn env_nonempty(name: &'static str) -> Option<String> {
    std::env::var(name).ok().map(|v| v.trim().to_owned()).filter(|s| !s.is_empty())
}

async fn app_config() -> Json<AppConfigResponse> {
    Json(AppConfigResponse {
        gemini_live: providers::gemini_live_ready(),
        gemini_live_model: providers::gemini_live_model(),
        supabase_url: env_nonempty("SUPABASE_URL"),
        supabase_anon_key: env_nonempty("SUPABASE_ANON_KEY"),
        stripe_publishable_key: env_nonempty("STRIPE_PUBLISHABLE_KEY"),
        stripe_paywall_enabled: stripe::stripe_paywall_configured(),
    })
}

async fn live_session_shell(Query(query): Query<LiveConfigQuery>) -> Json<LiveSessionShellResponse> {
    let focus_label = query
        .focus
        .as_deref()
        .and_then(|id| focus_topics::resolve_label(&query.topic_id, id));

    let cached_opening = tutor::uses_cached_opening(&query.topic_id);
    let (opening_caption_english, opening_caption_french) = if cached_opening {
        let caps = opening_audio::opening_display_captions(&query.topic_id).await;
        (Some(caps.english), caps.french)
    } else {
        (None, None)
    };

    tracing::info!(
        topic_id = %query.topic_id,
        gemini_live_ready = providers::gemini_live_ready(),
        cached_opening,
        "[GEMINI_TRACK] GET /api/live/session-shell — no Gemini token"
    );

    Json(LiveSessionShellResponse {
        welcome: tutor::welcome_for_topic(&query.topic_id),
        cached_opening,
        opening_caption_english,
        opening_caption_french,
        step_count: tutor::guided_step_count(&query.topic_id),
        system_instruction: tutor::system_prompt(&query.topic_id, focus_label.as_deref()),
        gemini_live_ready: providers::gemini_live_ready(),
        focus_topics: focus_topics::topics_for_topic(&query.topic_id),
    })
}

async fn live_config(
    Query(query): Query<LiveConfigQuery>,
) -> Result<Json<LiveConfigResponse>, StatusCode> {
    if !providers::gemini_live_ready() {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }

    let auth = providers::gemini_live_auth()
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    tracing::info!(
        topic_id = %query.topic_id,
        live_model = %auth.model,
        "[GEMINI_TRACK] /api/live/config served (see auth_tokens HTTPS log above if present)"
    );

    let focus_label = query
        .focus
        .as_deref()
        .and_then(|id| focus_topics::resolve_label(&query.topic_id, id));

    let cached_opening = tutor::uses_cached_opening(&query.topic_id);
    let (opening_caption_english, opening_caption_french) = if cached_opening {
        let caps = opening_audio::opening_display_captions(&query.topic_id).await;
        (Some(caps.english), caps.french)
    } else {
        (None, None)
    };

    Ok(Json(LiveConfigResponse {
        token: auth.token,
        model: auth.model,
        system_instruction: tutor::system_prompt(&query.topic_id, focus_label.as_deref()),
        welcome: tutor::welcome_for_topic(&query.topic_id),
        step_count: tutor::guided_step_count(&query.topic_id),
        cached_opening,
        opening_caption_english,
        opening_caption_french,
        focus_topics: focus_topics::topics_for_topic(&query.topic_id),
    }))
}

async fn opening_audio(
    Query(query): Query<OpeningAudioQuery>,
) -> Result<Json<OpeningAudioResponse>, StatusCode> {
    if !tutor::uses_cached_opening(&query.topic_id) {
        return Err(StatusCode::NOT_FOUND);
    }

    let audio = opening_audio::opening_audio_base64(&query.topic_id)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    Ok(Json(OpeningAudioResponse {
        audio,
        sample_rate: 24000,
    }))
}

async fn session_focus_topics(
    Query(query): Query<TopicIdQuery>,
) -> Json<FocusTopicsBody> {
    Json(FocusTopicsBody {
        topics: focus_topics::topics_for_topic(&query.topic_id),
    })
}

#[derive(Debug, Deserialize)]
struct LiveSubtitlesRequestBody {
    raw: String,
}

#[derive(Serialize)]
struct LiveSubtitlesResponseBody {
    english: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    french: Option<String>,
}

async fn live_subtitles(
    Json(body): Json<LiveSubtitlesRequestBody>,
) -> Result<Json<LiveSubtitlesResponseBody>, StatusCode> {
    if !providers::gemini_live_ready() {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }
    let raw = body.raw.trim();
    if raw.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    tracing::info!(
        raw_chars = raw.len(),
        "[GEMINI_TRACK] /api/live/subtitles received — caption LLM (see caption generateContent logs)"
    );
    match providers::gemini_subtitles_llm(raw).await {
        Some(lines) => {
            let en = lines.english.trim().to_string();
            if en.is_empty() {
                return Err(StatusCode::UNPROCESSABLE_ENTITY);
            }
            Ok(Json(LiveSubtitlesResponseBody {
                english: en,
                french: lines
                    .french
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty()),
            }))
        }
        None => Err(StatusCode::SERVICE_UNAVAILABLE),
    }
}

async fn live_nudge(
    Query(query): Query<LiveNudgeQuery>,
) -> Result<Json<LiveNudgeResponse>, StatusCode> {
    let focus_label = query
        .focus
        .as_deref()
        .and_then(|id| focus_topics::resolve_label(&query.topic_id, id));

    let nudge = tutor::turn_nudge(&query.topic_id, query.step, focus_label.as_deref())
        .ok_or(StatusCode::NOT_FOUND)?;
    Ok(Json(LiveNudgeResponse { nudge }))
}

fn load_env_file() {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let root_env = manifest.join("../.env");
    if root_env.is_file() {
        if let Err(error) = dotenvy::from_path(&root_env) {
            eprintln!("warning: could not load {}: {error}", root_env.display());
        }
        return;
    }

    let _ = dotenvy::dotenv();
}

#[tokio::main]
async fn main() {
    load_env_file();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                "guengo_api=info,tower_http=warn".into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!(
        "[GEMINI_TRACK] enabled — grep this tag in stderr for Gemini REST calls; Live WebSocket traffic is billed separately by Google Client SDK"
    );

    let static_root = resolve_public_dir();
    if !static_root.exists() {
        tracing::warn!(
            path = %static_root.display(),
            "static root missing; browser UI will 404 until you run frontend build/watch"
        );
    } else {
        tracing::info!(path = %static_root.display(), "serving static files");
    }

    if providers::gemini_live_ready() {
        tracing::info!(
            model = %providers::gemini_live_model(),
            tts_model = %providers::gemini_tts_model(),
            "Gemini Live ok; intro PCM is disk-only unless you run warm-opening-audio (--synthesize-if-missing synthesizes via Node)"
        );
    } else {
        tracing::warn!("GEMINI_API_KEY missing — voice sessions unavailable");
    }

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let index_html = static_root.join("index.html");
    let static_files = ServeDir::new(static_root).not_found_service(ServeFile::new(index_html.clone()));

    let index_for_app = index_html.clone();
    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/config", get(app_config))
        .route("/api/session/focus-topics", get(session_focus_topics))
        .route("/api/live/session-shell", get(live_session_shell))
        .route("/api/live/config", get(live_config))
        .route("/api/live/opening-audio", get(opening_audio))
        .route("/api/live/nudge", get(live_nudge))
        .route("/api/live/subtitles", post(live_subtitles))
        .route("/api/stripe/checkout", post(stripe::create_checkout_session))
        .route("/api/stripe/webhook", post(stripe::stripe_webhook))
        // Client router (`App.tsx`) expects `/app` for the learning UI; `ServeDir` alone 404s this path.
        .route(
            "/app",
            get_service(ServeFile::new(index_for_app.clone())),
        )
        .route(
            "/app/",
            get_service(ServeFile::new(index_for_app.clone())),
        )
        .route(
            "/app/{*path}",
            get_service(ServeFile::new(index_for_app)),
        )
        .fallback_service(static_files)
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let addr = "127.0.0.1:8080";
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap_or_else(|err| {
        eprintln!(
            "\n[Guengo] Cannot bind {addr}: {err}\n\
             Another guengo-api is probably still running.\n\
             Windows: taskkill /F /IM guengo-api.exe\n\
             Or run: npm run dev (auto-kills stale process)\n"
        );
        std::process::exit(1);
    });
    tracing::info!("listening on http://{addr}");
    axum::serve(listener, app).await.expect("server");
}

fn resolve_public_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("GUENGO_PUBLIC_DIR") {
        return PathBuf::from(dir);
    }

    let candidates = ["../frontend/public", "frontend/public"];
    for rel in candidates {
        let path = PathBuf::from(rel);
        if path.is_dir() {
            return path;
        }
    }

    PathBuf::from("../frontend/public")
}
