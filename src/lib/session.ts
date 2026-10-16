// src/lib/session.ts
//
// THE way server code gets the signed-in user. Never call next-auth's getServerSession directly elsewhere.
//
// A JWT session stays cryptographically valid until it expires, so on every request this re-reads the AkadVerse
// account and its Marketplace state, and returns no session when:
//   - the account no longer exists in AkadVerse,
//   - it is no longer a student account (AkadVerse changed its role),
//   - it is blocked in the Marketplace (takes effect immediately, not at the next login), or
//   - its Marketplace session version has moved on since the token was issued (block, admin revoke).
// Admin status (AkadVerse's User.isAdmin) is also read live, so revoking an admin applies at once and a token can't
// carry stale privileges.

import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MARKETPLACE_ROLE } from "@/lib/akadverse-identity";
import { toAccountState } from "@/lib/account-state";
import { forbidden } from "@/lib/service-error";

export const BLOCKED_MESSAGE = "Your account has been blocked. Contact support if you believe this is a mistake.";

type Token = { id?: string; sv?: number };

export async function resolveSession(session: Session | null, tokenVersion: number | undefined, { throwIfBlocked = true } = {}): Promise<Session | null> {
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, firstName: true, lastName: true, isAdmin: true, role: true, marketplaceAccount: { select: { blocked: true, sessionVersion: true } } },
  });
  if (!user || user.role !== MARKETPLACE_ROLE) return null;
  const state = toAccountState(user.marketplaceAccount);
  if (state.blocked) {
    if (throwIfBlocked) throw forbidden(BLOCKED_MESSAGE);
    return null;
  }
  if (tokenVersion !== undefined && tokenVersion !== state.sessionVersion) return null;
  return {
    ...session,
    user: { id: user.id, email: user.email, name: `${user.firstName} ${user.lastName}`, firstName: user.firstName, isAdmin: user.isAdmin },
  };
}

// For API controllers and services: null when not signed in / revoked; throws 403 when the account is blocked.
export async function getActiveSession(options: { throwIfBlocked?: boolean } = {}): Promise<Session | null> {
  let version: number | undefined;
  const session = await getServerSession({
    ...authOptions,
    callbacks: {
      ...authOptions.callbacks,
      async session(params) {
        version = (params.token as Token).sv;
        return authOptions.callbacks!.session!(params);
      },
    },
  });
  // A token without a version predates this check and is treated as revoked.
  if (session && version === undefined) return null;
  return resolveSession(session as Session | null, version, options);
}
