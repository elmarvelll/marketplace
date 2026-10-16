// src/lib/admin.ts
//
// The gate for every administrative route. Marketplace admin = AkadVerse's User.isAdmin — the same flag AkadVerse's
// own Marketplace admin dashboard uses, so one admin list serves both apps. Read live from the database on each
// request (src/lib/session.ts), never trusted from the token alone and never taken from anything the client sends. Being an approved seller or deliverer does not
// make someone an admin.

import type { Session } from "next-auth";
import { getActiveSession } from "@/lib/session";
import { unauthorized, forbidden } from "@/lib/service-error";

export async function requireAdmin(): Promise<Session> {
  const session = await getActiveSession();
  if (!session?.user?.id) throw unauthorized();
  if (!session.user.isAdmin) throw forbidden("Admin access required.");
  return session;
}
