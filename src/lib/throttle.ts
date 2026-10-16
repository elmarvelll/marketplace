// src/lib/throttle.ts
//
// Attempt limiting for sign-in. Counters live in the database
// (marketplace."AuthThrottle"), so a limit holds across serverless instances and restarts — an in-memory counter would not.
//
//   await consumeAttempt("login:email:a@b.c", { limit: 8, windowMs: 15 min, lockMs: 15 min })
//     -> counts one attempt; once `limit` is exceeded inside the window the key is locked and this throws 429
//   await clearAttempts(key)   -> on success (e.g. a correct password), forget the failures
//
// Keys are built by the caller from an action plus a subject (a normalised email, or a client IP).

import { prisma } from "@/lib/prisma";
import { tooManyRequests } from "@/lib/service-error";

export interface ThrottleRule {
  limit: number;
  windowMs: number;
  lockMs: number;
}

const waitMessage = (until: Date, now: Date) => {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60000));
  return `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
};

export async function consumeAttempt(key: string, rule: ThrottleRule, now: Date = new Date()): Promise<void> {
  const row = await prisma.authThrottle.findUnique({ where: { key } });
  if (row?.lockedUntil && row.lockedUntil > now) throw tooManyRequests(waitMessage(row.lockedUntil, now));

  const windowExpired = !row || now.getTime() - row.windowStart.getTime() > rule.windowMs;
  if (windowExpired) {
    await prisma.authThrottle.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now },
      update: { count: 1, windowStart: now, lockedUntil: null },
    });
    return;
  }

  // Atomic increment, so concurrent attempts can't slip under the limit.
  const updated = await prisma.authThrottle.update({ where: { key }, data: { count: { increment: 1 } } });
  if (updated.count > rule.limit) {
    const lockedUntil = new Date(now.getTime() + rule.lockMs);
    await prisma.authThrottle.update({ where: { key }, data: { lockedUntil } });
    throw tooManyRequests(waitMessage(lockedUntil, now));
  }
}

export async function clearAttempts(key: string): Promise<void> {
  await prisma.authThrottle.deleteMany({ where: { key } });
}

// The first address in X-Forwarded-For is the client as seen by the hosting platform's proxy. Used only as a
// throttling key (never for authorization), so a spoofed header can at worst give an attacker their own bucket —
// the per-email limit still applies.
export function clientIp(headers: Headers | Record<string, string | string[] | undefined> | undefined): string {
  if (!headers) return "unknown";
  const read = (name: string) => {
    if (headers instanceof Headers) return headers.get(name);
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const forwarded = read("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? read("x-real-ip") ?? "unknown").trim().slice(0, 64) || "unknown";
}

export const LOGIN_RULE_PER_EMAIL: ThrottleRule = { limit: 8, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 };
export const LOGIN_RULE_PER_IP: ThrottleRule = { limit: 40, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 };
