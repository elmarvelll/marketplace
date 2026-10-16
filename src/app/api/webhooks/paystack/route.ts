// src/app/api/webhooks/paystack/route.ts
//
// POST -> Paystack calls this directly (no session cookie) when a
// transaction's status changes. Deliberately under /api/webhooks/ (not
// /api/marketplace/) so it's a clean prefix match in src/proxy.ts's
// PUBLIC_API_PREFIXES. Thin route — see ./route.controller.ts.
//
// Note: Paystack can't actually reach this route on a local dev machine
// without a public URL (e.g. an ngrok tunnel) — the checkout page's
// verify call is what actually confirms payment in local development.

import { NextRequest } from "next/server";
import { handleWebhook } from "./route.controller";

export async function POST(request: NextRequest) {
  return handleWebhook(request);
}
