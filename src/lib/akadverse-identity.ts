// src/lib/akadverse-identity.ts
//
// AkadVerse is the identity authority: every Marketplace account IS an AkadVerse User row (same id), created only by
// AkadVerse's own sign-up. This module answers "is this the right password for this AkadVerse account, and may the
// account use the Marketplace?" by reading that row through the restricted runtime role.
//
//   - The bcrypt hash is read and compared in memory, never copied, logged or returned. The runtime role can't write
//     User.password, email or role at all (db/runtime-grants.json), so the Marketplace can't change an AkadVerse login.
//   - Only `role = student` accounts may use the Marketplace — the same rule AkadVerse applies to its Marketplace
//     section. Admin rights are AkadVerse's User.isAdmin flag (the Marketplace admin flag in AkadVerse's own schema).
//   - "No such email", "wrong password" and "no password" (an AkadVerse Google-only account, stored as an empty hash)
//     take about the same time and give the same answer, so neither can be probed.

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const MARKETPLACE_ROLE = "student";

export interface AkadverseAccount {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export type AkadverseVerification =
  | { status: "ok"; account: AkadverseAccount }
  // No account with that email, wrong password, or an account with no password — deliberately one answer.
  | { status: "invalid" }
  // Right password, but the account isn't a student account.
  | { status: "not_eligible" };

// A real bcrypt hash of a random value, made once per process: compared against when there's nothing to compare, so
// every failure costs one bcrypt comparison.
let dummyHash: string | null = null;
async function burnTime(password: string) {
  dummyHash ??= await bcrypt.hash(randomUUID(), 10);
  await bcrypt.compare(password, dummyHash).catch(() => false);
}

export async function verifyAkadverseCredentials(email: string, password: string): Promise<AkadverseVerification> {
  const row = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, password: true, firstName: true, lastName: true, role: true },
  });
  if (!row || !row.password) {
    await burnTime(password);
    return { status: "invalid" };
  }
  if (!(await bcrypt.compare(password, row.password))) return { status: "invalid" };
  if (row.role !== MARKETPLACE_ROLE) return { status: "not_eligible" };
  return { status: "ok", account: { id: row.id, email: row.email, firstName: row.firstName, lastName: row.lastName } };
}
