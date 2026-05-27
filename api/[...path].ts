import type { VercelRequest, VercelResponse } from "@vercel/node";
import { routeApi } from "./_lib/router";

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.path;
  const segments = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? [raw]
      : [];
  await routeApi(req, res, segments);
}
