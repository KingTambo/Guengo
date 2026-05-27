import type { VercelRequest, VercelResponse } from "@vercel/node";
import { routeApi } from "./_lib/router";

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

/** Path segments after `/api/` — catch-all files are Next-only; use index + rewrite on Vercel. */
function apiPathSegments(req: VercelRequest): string[] {
  const fromUrl = (() => {
    const host = req.headers.host ?? "localhost";
    const rawUrl = req.url ?? "/";
    const pathname = rawUrl.startsWith("http")
      ? new URL(rawUrl).pathname
      : new URL(rawUrl, `https://${host}`).pathname;
    const match = pathname.match(/^\/api(?:\/(.*))?$/);
    if (!match?.[1]) return [] as string[];
    return match[1].split("/").filter(Boolean);
  })();
  if (fromUrl.length) return fromUrl;

  const raw =
    req.query.path ??
    req.query["...path"] ??
    req.query["...slug"];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string" && raw.length) return raw.split("/").filter(Boolean);
  return [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await routeApi(req, res, apiPathSegments(req));
}
