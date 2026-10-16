// src/lib/controller-helpers.ts
//
// Shared plumbing every API controller (src/app/api/**/route.controller.ts)
// uses: turning a thrown ServiceError into the right NextResponse, safely
// parsing a request body, and resolving the signed-in session. This is the
// one "shared" layer that sits above every per-folder shared/ helper,
// since every controller in the app needs it, not just the ones in one
// resource folder.

import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { getActiveSession } from "@/lib/session";
import { ServiceError, badRequest, unauthorized } from "@/lib/service-error";

export function serviceErrorResponse(err: unknown): NextResponse {
  if (err instanceof ServiceError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // Anything else is a real bug/unexpected failure — log it server-side,
  // don't leak internals to the client.
  console.error(err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

// A controller's whole body wrapped in this never needs its own
// try/catch — thrown ServiceErrors (and anything else) are turned into
// the right response automatically.
export async function runController(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (err) {
    return serviceErrorResponse(err);
  }
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw badRequest("Invalid request body.");
  }
}

// Every controller that just needs "am I signed in" reaches for this
// instead of repeating getActiveSession + the null check — used across
// every resource folder, so it lives here rather than in any one
// folder's shared/.
export async function requireSession(): Promise<Session> {
  const session = await getActiveSession();
  if (!session?.user?.id) throw unauthorized();
  return session;
}

export async function requireSessionUserId(): Promise<string> {
  const session = await requireSession();
  return session.user.id;
}
