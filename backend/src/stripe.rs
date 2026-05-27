//! Stripe Checkout (subscription) + webhook handler for `profiles.is_premium`.
//! Requires env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//! SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, SUPABASE_ANON_KEY — see `.env.example`.

use axum::body::Bytes;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use base64::Engine as _;
use chrono::Utc;
use hmac::{Hmac, Mac};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::Sha256;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

const STRIPE_SUBSCRIPTION_EUR_CENTS: &str = "1700";
const STRIPE_SUBSCRIPTION_PRODUCT_NAME: &str = "Guengo Premium";

pub fn stripe_paywall_configured() -> bool {
    crate::env_nonempty("STRIPE_SECRET_KEY").is_some()
        && crate::env_nonempty("STRIPE_WEBHOOK_SECRET").is_some()
        && crate::env_nonempty("SUPABASE_SERVICE_ROLE_KEY").is_some()
        && crate::env_nonempty("SUPABASE_URL").is_some()
        && crate::env_nonempty("SUPABASE_ANON_KEY").is_some()
}

fn stripe_sk() -> Option<String> {
    crate::env_nonempty("STRIPE_SECRET_KEY")
}

fn webhook_secret() -> Option<String> {
    crate::env_nonempty("STRIPE_WEBHOOK_SECRET")
}

fn supabase_url() -> Option<String> {
    crate::env_nonempty("SUPABASE_URL")
}

fn supabase_anon_key() -> Option<String> {
    crate::env_nonempty("SUPABASE_ANON_KEY")
}

fn supabase_service_role() -> Option<String> {
    crate::env_nonempty("SUPABASE_SERVICE_ROLE_KEY")
}

fn public_app_url() -> String {
    crate::env_nonempty("PUBLIC_APP_URL").unwrap_or_else(|| "http://127.0.0.1:8080".to_string())
}

fn supabase_rest_base() -> Result<String, String> {
    let base = supabase_url().ok_or_else(|| "SUPABASE_URL missing".to_string())?;
    Ok(format!("{}/rest/v1", base.trim_end_matches('/')))
}
#[derive(Serialize)]
pub struct StripeCheckoutEnvelope {
    pub checkout_url: String,
}

#[derive(Serialize)]
pub struct StripePortalEnvelope {
    pub portal_url: String,
}

/// Corps vide autorisé (Axum exige typiquement un extractor `body` sur POST).
pub async fn create_checkout_session(
    headers: HeaderMap,
    _body: Bytes,
) -> Result<Json<StripeCheckoutEnvelope>, StatusCode> {
    if !stripe_paywall_configured() {
        tracing::warn!("Stripe checkout unavailable: missing STRIPE_* or SUPABASE_SERVICE_ROLE_KEY");
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }

    let token = bearer_token(&headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let supabase_base = supabase_url().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    let anon = supabase_anon_key().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    let sk = stripe_sk().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let user = fetch_supabase_user(&supabase_base, &anon, &token).await?;
    let user_id = user["id"].as_str().ok_or(StatusCode::UNAUTHORIZED)?;
    let email = user["email"].as_str().unwrap_or("");

    let base = public_app_url().trim_end_matches('/').to_string();
    let success_url = format!("{base}/paywall?checkout=success");
    let cancel_url = format!("{base}/paywall?checkout=cancel");

    let client = reqwest::Client::new();
    let mut params: Vec<(&str, &str)> = vec![
        ("mode", "subscription"),
        ("success_url", success_url.as_str()),
        ("cancel_url", cancel_url.as_str()),
        ("client_reference_id", user_id),
        ("line_items[0][quantity]", "1"),
        ("line_items[0][price_data][currency]", "eur"),
        (
            "line_items[0][price_data][unit_amount]",
            STRIPE_SUBSCRIPTION_EUR_CENTS,
        ),
        (
            "line_items[0][price_data][recurring][interval]",
            "month",
        ),
        (
            "line_items[0][price_data][product_data][name]",
            STRIPE_SUBSCRIPTION_PRODUCT_NAME,
        ),
        (
            "subscription_data[metadata][supabase_user_id]",
            user_id,
        ),
    ];
    if !email.is_empty() {
        params.push(("customer_email", email));
    }

    let resp = client
        .post("https://api.stripe.com/v1/checkout/sessions")
        .header("Authorization", format!("Bearer {sk}"))
        .form(&params)
        .send()
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "Stripe checkout HTTP");
            StatusCode::BAD_GATEWAY
        })?;

    let status = resp.status();
    let body = resp.text().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !status.is_success() {
        tracing::error!(status = %status, body = %body, "Stripe checkout error");
        return Err(StatusCode::BAD_GATEWAY);
    }

    let parsed: Value = serde_json::from_str(&body).map_err(|e| {
        tracing::error!(error = %e, "Stripe checkout JSON");
        StatusCode::BAD_GATEWAY
    })?;
    let url = parsed["url"]
        .as_str()
        .ok_or(StatusCode::BAD_GATEWAY)?
        .to_string();

    Ok(Json(StripeCheckoutEnvelope { checkout_url: url }))
}

/// Portail client Stripe (gérer / résilier l’abonnement).
pub async fn create_billing_portal_session(
    headers: HeaderMap,
    _body: Bytes,
) -> Result<Json<StripePortalEnvelope>, StatusCode> {
    if !stripe_paywall_configured() {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }

    let token = bearer_token(&headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let supabase_base = supabase_url().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    let anon = supabase_anon_key().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    let sk = stripe_sk().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let user = fetch_supabase_user(&supabase_base, &anon, &token).await?;
    let user_id = user["id"].as_str().ok_or(StatusCode::UNAUTHORIZED)?.to_string();
    let email = user["email"].as_str().map(|s| s.to_string());

    let customer_id = resolve_stripe_customer_id(&user_id, email.as_deref(), &sk).await?;
    let base = public_app_url().trim_end_matches('/').to_string();
    let return_url = format!("{base}/app");

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.stripe.com/v1/billing_portal/sessions")
        .header("Authorization", format!("Bearer {sk}"))
        .form(&[("customer", customer_id.as_str()), ("return_url", return_url.as_str())])
        .send()
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "Stripe billing portal HTTP");
            StatusCode::BAD_GATEWAY
        })?;

    let status = resp.status();
    let body = resp.text().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !status.is_success() {
        tracing::error!(status = %status, body = %body, "Stripe billing portal error");
        return Err(StatusCode::BAD_GATEWAY);
    }

    let parsed: Value = serde_json::from_str(&body).map_err(|_| StatusCode::BAD_GATEWAY)?;
    let url = parsed["url"]
        .as_str()
        .ok_or(StatusCode::BAD_GATEWAY)?
        .to_string();

    Ok(Json(StripePortalEnvelope { portal_url: url }))
}

async fn fetch_profile_stripe_customer_id(user_id: &str) -> Result<Option<String>, StatusCode> {
    let rest = supabase_rest_base().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let svc = supabase_service_role().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    let url = format!(
        "{rest}/profiles?id=eq.{user_id}&select=stripe_customer_id"
    );
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {svc}"))
        .header("apikey", svc)
        .send()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let body = resp.text().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let rows: Vec<Value> = serde_json::from_str(&body).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(rows
        .get(0)
        .and_then(|r| r["stripe_customer_id"].as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string()))
}

async fn save_profile_stripe_customer_id(user_id: &str, customer_id: &str) -> Result<(), StatusCode> {
    supabase_patch_profile(
        user_id,
        json!({
            "stripe_customer_id": customer_id,
            "updated_at": Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        }),
    )
    .await
}

async fn resolve_stripe_customer_id(
    user_id: &str,
    email: Option<&str>,
    sk: &str,
) -> Result<String, StatusCode> {
    if let Some(existing) = fetch_profile_stripe_customer_id(user_id).await? {
        return Ok(existing);
    }

    let client = reqwest::Client::new();

    if let Some(em) = email.filter(|s| !s.is_empty()) {
        let escaped = em.replace('\'', "\\'");
        let query = format!("email:'{escaped}'");
        let search_resp = client
            .get("https://api.stripe.com/v1/customers/search")
            .header("Authorization", format!("Bearer {sk}"))
            .query(&[("query", query.as_str()), ("limit", "1")])
            .send()
            .await
            .map_err(|_| StatusCode::BAD_GATEWAY)?;

        if search_resp.status().is_success() {
            let search_body: Value = search_resp.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
            if let Some(found) = search_body["data"]
                .as_array()
                .and_then(|a| a.first())
                .and_then(|c| c["id"].as_str())
                .filter(|s| !s.is_empty())
            {
                save_profile_stripe_customer_id(user_id, found).await?;
                return Ok(found.to_string());
            }
        }
    }

    let mut params: Vec<(&str, String)> = vec![(
        "metadata[supabase_user_id]",
        user_id.to_string(),
    )];
    if let Some(em) = email.filter(|s| !s.is_empty()) {
        params.push(("email", em.to_string()));
    }

    let create_resp = client
        .post("https://api.stripe.com/v1/customers")
        .header("Authorization", format!("Bearer {sk}"))
        .form(&params)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let status = create_resp.status();
    let body = create_resp.text().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    if !status.is_success() {
        tracing::error!(status = %status, body = %body, "Stripe create customer");
        return Err(StatusCode::BAD_GATEWAY);
    }

    let parsed: Value = serde_json::from_str(&body).map_err(|_| StatusCode::BAD_GATEWAY)?;
    let customer_id = parsed["id"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or(StatusCode::BAD_GATEWAY)?
        .to_string();

    save_profile_stripe_customer_id(user_id, &customer_id).await?;
    Ok(customer_id)
}

fn bearer_token(headers: &HeaderMap) -> Option<String> {
    let auth = headers.get(axum::http::header::AUTHORIZATION)?.to_str().ok()?;
    auth.strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

async fn fetch_supabase_user(supabase_base: &str, anon: &str, jwt: &str) -> Result<Value, StatusCode> {
    let url = format!(
        "{}/auth/v1/user",
        supabase_base.trim_end_matches('/')
    );
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {jwt}"))
        .header("apikey", anon)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    if !resp.status().is_success() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    resp.json::<Value>()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)
}

fn verify_stripe_signature(payload: &[u8], sig_header: &str, secret: &str) -> Result<(), StatusCode> {
    let whsec = secret.strip_prefix("whsec_").ok_or(StatusCode::BAD_REQUEST)?;
    let key = base64::engine::general_purpose::STANDARD
        .decode(whsec.trim())
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let mut timestamp: Option<&str> = None;
    let mut v1: Vec<&str> = Vec::new();
    for part in sig_header.split(',') {
        let mut it = part.splitn(2, '=');
        let k = it.next().unwrap_or("").trim();
        let v = it.next().unwrap_or("").trim();
        match k {
            "t" => timestamp = Some(v),
            "v1" => v1.push(v),
            _ => {}
        }
    }
    let t = timestamp.ok_or(StatusCode::BAD_REQUEST)?;

    let mut signed = Vec::with_capacity(t.len() + 1 + payload.len());
    signed.extend_from_slice(t.as_bytes());
    signed.push(b'.');
    signed.extend_from_slice(payload);

    let mut mac = HmacSha256::new_from_slice(&key).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    mac.update(&signed);
    let expected = mac.finalize().into_bytes();
    let expected_hex: String = expected.iter().map(|b| format!("{b:02x}")).collect();

    let mut ok = false;
    for sig in v1 {
        if sig.len() == expected_hex.len() && sig.as_bytes().ct_eq(expected_hex.as_bytes()).into() {
            ok = true;
            break;
        }
    }
    if !ok {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Light replay window (Stripe recommends ~5 minutes)
    if let Ok(ts) = t.parse::<i64>() {
        let now = Utc::now().timestamp();
        if (now - ts).abs() > 600 {
            return Err(StatusCode::BAD_REQUEST);
        }
    }

    Ok(())
}

pub async fn stripe_webhook(headers: HeaderMap, body: Bytes) -> StatusCode {
    let Some(secret) = webhook_secret() else {
        tracing::warn!("stripe_webhook called but STRIPE_WEBHOOK_SECRET not set");
        return StatusCode::SERVICE_UNAVAILABLE;
    };

    let Some(sig) = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
    else {
        return StatusCode::BAD_REQUEST;
    };

    let payload = body.as_ref();
    if verify_stripe_signature(payload, sig, &secret).is_err() {
        tracing::warn!("invalid Stripe webhook signature");
        return StatusCode::BAD_REQUEST;
    }

    let evt: Value = match serde_json::from_slice(payload) {
        Ok(v) => v,
        Err(e) => {
            tracing::error!(error = %e, "webhook JSON");
            return StatusCode::BAD_REQUEST;
        }
    };

    let Some(evt_type) = evt["type"].as_str() else {
        return StatusCode::OK;
    };
    let object = evt["data"]["object"].clone();

    let res = match evt_type {
        "checkout.session.completed" => handle_checkout_completed(&object).await,
        "customer.subscription.updated" => handle_subscription(&object).await,
        "customer.subscription.deleted" => handle_subscription(&object).await,
        _ => Ok(()),
    };

    match res {
        Ok(()) => StatusCode::OK,
        Err(code) => code,
    }
}

fn subscription_is_premium_status(status: &str) -> bool {
    matches!(status, "active" | "trialing")
}

async fn stripe_get_subscription(sk: &str, sub_id: &str) -> Result<Value, StatusCode> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!(
            "https://api.stripe.com/v1/subscriptions/{sub_id}"
        ))
        .header("Authorization", format!("Bearer {sk}"))
        .send()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let body = resp.text().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    serde_json::from_str(&body).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn supabase_patch_profile(user_id: &str, patch: Value) -> Result<(), StatusCode> {
    let rest = supabase_rest_base().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let svc = supabase_service_role().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    let url = format!("{rest}/profiles?id=eq.{user_id}");

    let client = reqwest::Client::new();
    let resp = client
        .patch(&url)
        .header("Authorization", format!("Bearer {svc}"))
        .header("apikey", svc)
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .body(patch.to_string())
        .send()
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "supabase patch profiles");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if !resp.status().is_success() {
        let txt = resp.text().await.unwrap_or_default();
        tracing::error!(body = %txt, "supabase patch rejected");
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    Ok(())
}

async fn supabase_get_profile(user_id: &str) -> Result<Value, StatusCode> {
    let rest = supabase_rest_base().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let svc = supabase_service_role().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    let url = format!(
        "{rest}/profiles?id=eq.{user_id}&select=onboarding_quiz_completed_at,readiness_completed_at,onboarding_completed_at"
    );
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {svc}"))
        .header("apikey", svc)
        .send()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let body = resp.text().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let rows: Vec<Value> = serde_json::from_str(&body).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    rows.into_iter().next().ok_or(StatusCode::NOT_FOUND)
}

async fn lookup_user_by_subscription(sub_id: &str) -> Result<String, StatusCode> {
    let rest = supabase_rest_base().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let svc = supabase_service_role().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    let url = format!("{rest}/profiles?stripe_subscription_id=eq.{sub_id}&select=id");
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {svc}"))
        .header("apikey", svc)
        .send()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let body = resp.text().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let rows: Vec<Value> = serde_json::from_str(&body).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let id = rows
        .get(0)
        .and_then(|r| r["id"].as_str())
        .ok_or(StatusCode::NOT_FOUND)?;
    Ok(id.to_string())
}

async fn merge_premium_into_profile_patch(
    user_id: &str,
    stripe_customer_id: Option<&str>,
    stripe_subscription_id: Option<&str>,
    stripe_status: &str,
) -> Result<Value, StatusCode> {
    let premium = subscription_is_premium_status(stripe_status);
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    let row = match supabase_get_profile(user_id).await {
        Ok(r) => r,
        Err(StatusCode::NOT_FOUND) => json!({}),
        Err(e) => return Err(e),
    };

    let q = row["onboarding_quiz_completed_at"]
        .as_str()
        .unwrap_or(now.as_str());
    let r = row["readiness_completed_at"]
        .as_str()
        .unwrap_or(now.as_str());
    let o = row["onboarding_completed_at"]
        .as_str()
        .unwrap_or(now.as_str());

    let mut patch = json!({
        "is_premium": premium,
        "stripe_subscription_status": stripe_status,
        "updated_at": now,
        "onboarding_quiz_completed_at": q,
        "readiness_completed_at": r,
        "onboarding_completed_at": o,
    });

    if let Some(cid) = stripe_customer_id {
        patch["stripe_customer_id"] = json!(cid);
    }
    if let Some(sid) = stripe_subscription_id {
        patch["stripe_subscription_id"] = json!(sid);
    }

    Ok(patch)
}

async fn handle_checkout_completed(session: &Value) -> Result<(), StatusCode> {
    let Some(mode) = session["mode"].as_str() else {
        return Ok(());
    };
    if mode != "subscription" {
        return Ok(());
    }

    let Some(user_id) = session["client_reference_id"]
        .as_str()
        .or_else(|| session["metadata"]["supabase_user_id"].as_str())
    else {
        tracing::warn!("checkout.session.completed missing client_reference_id");
        return Ok(());
    };

    let Some(sub_id) = session["subscription"].as_str() else {
        tracing::warn!("checkout.session.completed missing subscription id");
        return Ok(());
    };
    let customer = session["customer"].as_str().unwrap_or("");

    let sk = stripe_sk().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    let sub = stripe_get_subscription(&sk, sub_id).await?;
    let status = sub["status"].as_str().unwrap_or("incomplete");

    let patch = merge_premium_into_profile_patch(
        user_id,
        Some(customer).filter(|s| !s.is_empty()),
        Some(sub_id),
        status,
    )
    .await?;

    supabase_patch_profile(user_id, patch).await?;
    tracing::info!(user_id = %user_id, status = %status, "Stripe checkout.session.completed profile updated");
    Ok(())
}

async fn handle_subscription(sub: &Value) -> Result<(), StatusCode> {
    let Some(sub_id) = sub["id"].as_str() else {
        return Ok(());
    };
    let status = sub["status"].as_str().unwrap_or("canceled");
    let customer = sub["customer"].as_str().unwrap_or("");

    let user_id = if let Some(id) = sub["metadata"]["supabase_user_id"].as_str() {
        id.to_string()
    } else {
        match lookup_user_by_subscription(sub_id).await {
            Ok(id) => id,
            Err(StatusCode::NOT_FOUND) => return Ok(()),
            Err(e) => return Err(e),
        }
    };

    let patch = merge_premium_into_profile_patch(
        &user_id,
        Some(customer).filter(|s| !s.is_empty()),
        Some(sub_id),
        status,
    )
    .await?;

    supabase_patch_profile(&user_id, patch).await?;
    tracing::info!(user_id = %user_id, status = %status, "Stripe subscription event profile updated");
    Ok(())
}
