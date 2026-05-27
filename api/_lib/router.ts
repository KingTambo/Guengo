import type { VercelRequest, VercelResponse } from "@vercel/node";
import { env } from "./env";
import {
  geminiLiveAuth,
  geminiLiveModel,
  geminiLiveReady,
  geminiSubtitlesLlm,
} from "./gemini";
import { resolveLabel, topicsForTopic } from "./focus-topics";
import { openingAudioBase64, openingDisplayCaptions } from "./opening";
import { createCheckoutSession, createBillingPortalSession, stripePaywallConfigured, stripeWebhook } from "./stripe";
import {
  guidedStepCount,
  systemPrompt,
  turnNudge,
  usesCachedOpening,
  welcomeForTopic,
} from "./tutor";
import { methodNotAllowed, queryParam, readRawBody, sendJson } from "./http";

export async function routeApi(
  req: VercelRequest,
  res: VercelResponse,
  segments: string[],
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const route = segments.join("/");

  if (route === "health") {
    if (req.method !== "GET") return methodNotAllowed(res);
    return sendJson(res, 200, { status: "ok" });
  }

  if (route === "config") {
    if (req.method !== "GET") return methodNotAllowed(res);
    return sendJson(res, 200, {
      gemini_live: geminiLiveReady(),
      gemini_live_model: geminiLiveModel(),
      supabase_url: env("SUPABASE_URL") ?? null,
      supabase_anon_key: env("SUPABASE_ANON_KEY") ?? null,
      stripe_publishable_key: env("STRIPE_PUBLISHABLE_KEY") ?? null,
      stripe_paywall_enabled: stripePaywallConfigured(),
    });
  }

  if (route === "session/focus-topics") {
    if (req.method !== "GET") return methodNotAllowed(res);
    const topicId = queryParam(req, "topic_id");
    if (!topicId) return sendJson(res, 400, { error: "topic_id required" });
    return sendJson(res, 200, { topics: topicsForTopic(topicId) });
  }

  if (route === "live/session-shell") {
    if (req.method !== "GET") return methodNotAllowed(res);
    const topicId = queryParam(req, "topic_id");
    if (!topicId) return sendJson(res, 400, { error: "topic_id required" });
    const focus = queryParam(req, "focus");
    const focusLabel = focus ? resolveLabel(topicId, focus) : undefined;
    const cachedOpening = usesCachedOpening(topicId);
    let openingEnglish: string | null = null;
    let openingFrench: string | null = null;
    if (cachedOpening) {
      const caps = await openingDisplayCaptions(topicId);
      openingEnglish = caps.english;
      openingFrench = caps.french ?? null;
    }
    return sendJson(res, 200, {
      welcome: welcomeForTopic(topicId),
      cached_opening: cachedOpening,
      opening_caption_english: openingEnglish,
      opening_caption_french: openingFrench,
      step_count: guidedStepCount(topicId),
      system_instruction: systemPrompt(topicId, focusLabel),
      gemini_live_ready: geminiLiveReady(),
      focus_topics: topicsForTopic(topicId),
    });
  }

  if (route === "live/config") {
    if (req.method !== "GET") return methodNotAllowed(res);
    if (!geminiLiveReady()) return sendJson(res, 503, { error: "gemini_unavailable" });
    const topicId = queryParam(req, "topic_id");
    if (!topicId) return sendJson(res, 400, { error: "topic_id required" });
    const auth = await geminiLiveAuth();
    if (!auth) return sendJson(res, 503, { error: "gemini_unavailable" });
    const focus = queryParam(req, "focus");
    const focusLabel = focus ? resolveLabel(topicId, focus) : undefined;
    const cachedOpening = usesCachedOpening(topicId);
    let openingEnglish: string | null = null;
    let openingFrench: string | null = null;
    if (cachedOpening) {
      const caps = await openingDisplayCaptions(topicId);
      openingEnglish = caps.english;
      openingFrench = caps.french ?? null;
    }
    return sendJson(res, 200, {
      token: auth.token,
      model: auth.model,
      system_instruction: systemPrompt(topicId, focusLabel),
      welcome: welcomeForTopic(topicId),
      step_count: guidedStepCount(topicId),
      cached_opening: cachedOpening,
      opening_caption_english: openingEnglish,
      opening_caption_french: openingFrench,
      focus_topics: topicsForTopic(topicId),
    });
  }

  if (route === "live/opening-audio") {
    if (req.method !== "GET") return methodNotAllowed(res);
    const topicId = queryParam(req, "topic_id");
    if (!topicId) return sendJson(res, 400, { error: "topic_id required" });
    if (!usesCachedOpening(topicId)) return sendJson(res, 404, { error: "not_found" });
    const audio = await openingAudioBase64(topicId);
    if (!audio) return sendJson(res, 503, { error: "opening_unavailable" });
    return sendJson(res, 200, { audio, sample_rate: 24000 });
  }

  if (route === "live/nudge") {
    if (req.method !== "GET") return methodNotAllowed(res);
    const topicId = queryParam(req, "topic_id");
    const stepRaw = queryParam(req, "step");
    if (!topicId || !stepRaw) {
      return sendJson(res, 400, { error: "topic_id and step required" });
    }
    const step = Number.parseInt(stepRaw, 10);
    const focus = queryParam(req, "focus");
    const focusLabel = focus ? resolveLabel(topicId, focus) : undefined;
    const nudge = turnNudge(topicId, step, focusLabel);
    if (!nudge) return sendJson(res, 404, { error: "not_found" });
    return sendJson(res, 200, { nudge });
  }

  if (route === "live/subtitles") {
    if (req.method !== "POST") return methodNotAllowed(res);
    if (!geminiLiveReady()) return sendJson(res, 503, { error: "gemini_unavailable" });
    const rawBody = await readRawBody(req);
    let body: { raw?: string };
    try {
      body = JSON.parse(rawBody.toString("utf8")) as { raw?: string };
    } catch {
      return sendJson(res, 400, { error: "invalid_json" });
    }
    const raw = body.raw?.trim();
    if (!raw) return sendJson(res, 400, { error: "raw required" });
    const lines = await geminiSubtitlesLlm(raw);
    if (!lines?.english) return sendJson(res, 503, { error: "caption_failed" });
    return sendJson(res, 200, {
      english: lines.english,
      french: lines.french ?? null,
    });
  }

  if (route === "stripe/checkout") {
    if (req.method !== "POST") return methodNotAllowed(res);
    const result = await createCheckoutSession(req);
    return sendJson(res, result.status, result.body);
  }

  if (route === "stripe/portal") {
    if (req.method !== "POST") return methodNotAllowed(res);
    const result = await createBillingPortalSession(req);
    return sendJson(res, result.status, result.body);
  }

  if (route === "stripe/webhook") {
    if (req.method !== "POST") return methodNotAllowed(res);
    const payload = await readRawBody(req);
    const sig = req.headers["stripe-signature"];
    const sigHeader = Array.isArray(sig) ? sig[0] : sig;
    const status = await stripeWebhook(payload, sigHeader);
    res.status(status).end();
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}
