// src/lib/account-state.ts
//
// Marketplace-only state for an AkadVerse account (marketplace."AccountState"): the Marketplace block and the session
// version. No row means "not blocked, version 0" — rows are only created when something changes, so ordinary
// sign-ins never write here. A block or version bump affects Marketplace sessions only; AkadVerse is untouched.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface AccountStateView {
  blocked: boolean;
  blockedAt: Date | null;
  blockedReason: string | null;
  sessionVersion: number;
}

const DEFAULT_STATE: AccountStateView = { blocked: false, blockedAt: null, blockedReason: null, sessionVersion: 0 };

export function toAccountState(row: Partial<AccountStateView> | null | undefined): AccountStateView {
  return row ? { ...DEFAULT_STATE, ...row } : DEFAULT_STATE;
}

export async function getAccountState(userId: string): Promise<AccountStateView> {
  const row = await prisma.accountState.findUnique({ where: { userId }, select: { blocked: true, blockedAt: true, blockedReason: true, sessionVersion: true } });
  return toAccountState(row);
}

// Signs the user out of every Marketplace session (their next request finds a newer version than their token's).
export async function bumpSessionVersion(userId: string, tx: Prisma.TransactionClient = prisma): Promise<void> {
  await tx.accountState.upsert({
    where: { userId },
    create: { userId, sessionVersion: 1 },
    update: { sessionVersion: { increment: 1 } },
  });
}
