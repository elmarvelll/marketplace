// src/lib/cron-auth.ts
//
// Shared guard for every /api/cron/* route (see docs/marketplace/systems/cron-system.md).
// Vercel Cron calls these routes on schedule with an `Authorization: Bearer
// <CRON_SECRET>` header (configured once in vercel.json + the project's env
// vars) — this is the only thing standing between these routes and anyone
// who guesses the URL, since they're not behind the normal session-cookie
// gate (src/proxy.ts's PUBLIC_API_PREFIXES lets /api/cron/* through
// unauthenticated so Vercel's scheduler, which has no session, can call
// them at all).
//
// Shared database: AkadVerse runs the same jobs (payout sweeps, seller auto-reject, deliverer schedule emails...)
// against the same rows, so each job must run in exactly ONE app or it runs twice. These routes are therefore OFF here
// unless MARKETPLACE_SCHEDULED_JOBS=enabled — set it only after the jobs are switched off in AkadVerse (README
// "Scheduled jobs"). Opportunistic in-request work (checkout reconcile, email retry) is unaffected: it is idempotent
// per row by design.

import { NextRequest, NextResponse } from "next/server";

// marketplaceOnly: a job that exists only in this app (no AkadVerse twin to
// duplicate it), so it runs here whatever MARKETPLACE_SCHEDULED_JOBS says —
// e.g. /api/cron/vendor-slot-briefing. Still CRON_SECRET-authenticated.
export function requireCronSecret(request: NextRequest, { marketplaceOnly = false }: { marketplaceOnly?: boolean } = {}): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Refuse to run rather than silently allow every caller through if the
    // secret was never configured — a misconfigured deploy should fail
    // loudly here, not quietly skip auth.
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!marketplaceOnly && process.env.MARKETPLACE_SCHEDULED_JOBS !== "enabled") {
    return NextResponse.json({ error: "Scheduled jobs are disabled in this deployment (AkadVerse runs them). Set MARKETPLACE_SCHEDULED_JOBS=enabled to move them here." }, { status: 503 });
  }

  return null;
}
