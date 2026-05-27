import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest } from "@vercel/node";
import { env } from "./env";

/** Abonnement Guengo — créé inline à la caisse Stripe (pas de price_id préconfiguré). */
export const STRIPE_SUBSCRIPTION_EUR_CENTS = 1700;
export const STRIPE_SUBSCRIPTION_PRODUCT_NAME = "Guengo Premium";

export function stripePaywallConfigured(): boolean {
  return Boolean(
    env("STRIPE_SECRET_KEY") &&
      env("STRIPE_WEBHOOK_SECRET") &&
      env("SUPABASE_SERVICE_ROLE_KEY") &&
      env("SUPABASE_URL") &&
      env("SUPABASE_ANON_KEY"),
  );
}

function publicAppUrl(): string {
  return (env("PUBLIC_APP_URL") ?? "http://127.0.0.1:8080").replace(/\/$/, "");
}

function supabaseRestBase(): string | null {
  const base = env("SUPABASE_URL");
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/rest/v1`;
}

function bearerToken(req: VercelRequest): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

async function fetchSupabaseUser(
  jwt: string,
): Promise<{ id: string; email?: string } | null> {
  const base = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  if (!base || !anon) return null;
  const url = `${base.replace(/\/$/, "")}/auth/v1/user`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: anon },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string; email?: string };
  if (!user.id) return null;
  return { id: user.id, email: user.email };
}

export async function createCheckoutSession(
  req: VercelRequest,
): Promise<{ status: number; body: unknown }> {
  if (!stripePaywallConfigured()) {
    return { status: 503, body: { error: "stripe_unavailable" } };
  }
  const token = bearerToken(req);
  if (!token) return { status: 401, body: { error: "unauthorized" } };

  const user = await fetchSupabaseUser(token);
  if (!user) return { status: 401, body: { error: "unauthorized" } };

  const sk = env("STRIPE_SECRET_KEY")!;
  const base = publicAppUrl();
  const params = new URLSearchParams({
    mode: "subscription",
    success_url: `${base}/paywall?checkout=success`,
    cancel_url: `${base}/paywall?checkout=cancel`,
    client_reference_id: user.id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(
      STRIPE_SUBSCRIPTION_EUR_CENTS,
    ),
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]":
      STRIPE_SUBSCRIPTION_PRODUCT_NAME,
    "subscription_data[metadata][supabase_user_id]": user.id,
  });
  if (user.email) params.set("customer_email", user.email);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sk}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const text = await res.text();
  if (!res.ok) return { status: 502, body: { error: "stripe_error" } };
  const parsed = JSON.parse(text) as { url?: string };
  if (!parsed.url) return { status: 502, body: { error: "stripe_error" } };
  return { status: 200, body: { checkout_url: parsed.url } };
}

function verifyStripeSignature(
  payload: Buffer,
  sigHeader: string,
  secret: string,
): boolean {
  const whsec = secret.startsWith("whsec_") ? secret.slice(6) : null;
  if (!whsec) return false;
  const key = Buffer.from(whsec, "base64");

  let timestamp: string | undefined;
  const v1: string[] = [];
  for (const part of sigHeader.split(",")) {
    const [k, v] = part.split("=");
    if (k?.trim() === "t") timestamp = v?.trim();
    if (k?.trim() === "v1" && v) v1.push(v.trim());
  }
  if (!timestamp) return false;

  const signed = Buffer.concat([
    Buffer.from(timestamp, "utf8"),
    Buffer.from(".", "utf8"),
    payload,
  ]);
  const expected = createHmac("sha256", key).update(signed).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  let ok = false;
  for (const sig of v1) {
    const sigBuf = Buffer.from(sig, "utf8");
    if (
      sigBuf.length === expectedBuf.length &&
      timingSafeEqual(sigBuf, expectedBuf)
    ) {
      ok = true;
      break;
    }
  }
  if (!ok) return false;
  const ts = Number.parseInt(timestamp, 10);
  if (Number.isFinite(ts) && Math.abs(Math.floor(Date.now() / 1000) - ts) > 600) {
    return false;
  }
  return true;
}

async function patchProfile(userId: string, patch: Record<string, unknown>) {
  const rest = supabaseRestBase();
  const svc = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!rest || !svc) return false;
  const url = `${rest}/profiles?id=eq.${encodeURIComponent(userId)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${svc}`,
      apikey: svc,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  return res.ok;
}

function subscriptionIsPremium(status: string): boolean {
  return status === "active" || status === "trialing";
}

async function handleCheckoutCompleted(object: Record<string, unknown>) {
  const sk = env("STRIPE_SECRET_KEY");
  if (!sk) return 500;
  const userId =
    (object.client_reference_id as string) ||
    (object.metadata as { supabase_user_id?: string } | undefined)
      ?.supabase_user_id;
  const subId = object.subscription as string | undefined;
  if (!userId || !subId) return 200;

  const subRes = await fetch(
    `https://api.stripe.com/v1/subscriptions/${subId}`,
    { headers: { Authorization: `Bearer ${sk}` } },
  );
  if (!subRes.ok) return 500;
  const sub = (await subRes.json()) as { status?: string };
  const premium = subscriptionIsPremium(sub.status ?? "");
  await patchProfile(userId, { is_premium: premium });
  return 200;
}

async function handleSubscription(object: Record<string, unknown>) {
  const sk = env("STRIPE_SECRET_KEY");
  if (!sk) return 500;
  const userId = (object.metadata as { supabase_user_id?: string } | undefined)
    ?.supabase_user_id;
  if (!userId) return 200;
  const status = (object.status as string) ?? "";
  await patchProfile(userId, {
    is_premium: subscriptionIsPremium(status),
  });
  return 200;
}

export async function stripeWebhook(
  payload: Buffer,
  sigHeader: string | undefined,
): Promise<number> {
  const secret = env("STRIPE_WEBHOOK_SECRET");
  if (!secret) return 503;
  if (!sigHeader || !verifyStripeSignature(payload, sigHeader, secret)) {
    return 400;
  }
  let evt: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    evt = JSON.parse(payload.toString("utf8"));
  } catch {
    return 400;
  }
  const object = evt.data?.object ?? {};
  switch (evt.type) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(object);
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return handleSubscription(object);
    default:
      return 200;
  }
}
