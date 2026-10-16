// services/marketplace/notifications/email-outbox.ts
//
// Exactly-once, retriable transactional email — for the emails where a
// duplicate or a silent loss is a real problem (the paid-order email to a
// business/vendor owner, the business-blocked email). Ordinary best-effort
// emails keep using sendEmail() directly.
//
//   enqueueEmail   — insert an EmailDelivery row keyed by a caller-chosen
//                    dedupeKey (e.g. "order-paid:<orderId>"). A second enqueue
//                    for the same key hits the unique constraint and is a
//                    no-op, so a webhook + verify race, a retried request, or
//                    an admin double-click can never produce two emails.
//                    Accepts a transaction client so the row commits (or rolls
//                    back) together with the state change it describes.
//   deliverEmail   — send one row. Claims it first with a conditional update
//                    (a short lease via nextAttemptAt), so two concurrent
//                    deliverers can't both send it.
//   runEmailRetrySweep — re-attempts PENDING/FAILED rows whose backoff has
//                    elapsed. Driven by /api/cron/email-retry and
//                    opportunistically after checkout requests (see
//                    src/app/api/marketplace/checkout/initialize).
//
// A failed send never undoes the action that queued it — the row just waits
// for the next attempt. SENT means Resend accepted the message, not that it
// reached an inbox.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Db } from "@/services/marketplace/order/shared/db";
import { sendEmailWithResult } from "./email.service";

export const MAX_EMAIL_ATTEMPTS = 8;
const SEND_LEASE_MS = 5 * 60 * 1000;

export interface OutboxEmail {
  dedupeKey: string;
  to: string;
  subject: string;
  html: string;
  type: string;
}

// Returns the new row's id, or null when this dedupeKey was already queued.
export async function enqueueEmail(email: OutboxEmail, db: Db = prisma): Promise<string | null> {
  try {
    const row = await db.emailDelivery.create({
      data: { dedupeKey: email.dedupeKey, to: email.to, subject: email.subject, html: email.html, type: email.type },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
    throw err;
  }
}

// Exponential backoff: 2, 4, 8 … minutes, capped at 6 hours.
export function nextRetryDelayMs(attempts: number): number {
  return Math.min(2 ** Math.max(1, attempts) * 60 * 1000, 6 * 60 * 60 * 1000);
}

export type DeliverOutcome = "sent" | "failed" | "skipped";

export async function deliverEmail(id: string, now: Date = new Date()): Promise<DeliverOutcome> {
  // Claim: only a row that is due and not already being sent. Pushing
  // nextAttemptAt forward acts as the lease that keeps a concurrent
  // deliverer (another request's after(), or the cron) away from it.
  const claimed = await prisma.emailDelivery.updateMany({
    where: { id, status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now }, attempts: { lt: MAX_EMAIL_ATTEMPTS } },
    data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + SEND_LEASE_MS) },
  });
  if (claimed.count !== 1) return "skipped";

  const row = await prisma.emailDelivery.findUniqueOrThrow({ where: { id } });
  const result = await sendEmailWithResult({ to: row.to, subject: row.subject, html: row.html, type: row.type });

  if (result.ok) {
    await prisma.emailDelivery.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date(), providerMessageId: result.providerMessageId, lastError: null },
    });
    return "sent";
  }

  await prisma.emailDelivery.update({
    where: { id },
    data: { status: "FAILED", lastError: result.error.slice(0, 2000), nextAttemptAt: new Date(Date.now() + nextRetryDelayMs(row.attempts)) },
  });
  if (row.attempts >= MAX_EMAIL_ATTEMPTS) {
    console.error(`[email-outbox] giving up on "${row.type}" (${row.dedupeKey}) after ${row.attempts} attempts: ${result.error}`);
  }
  return "failed";
}

// Best-effort fan-out for ids just enqueued by a request; never throws.
export async function deliverEmails(ids: (string | null)[]): Promise<void> {
  for (const id of ids) {
    if (!id) continue;
    try {
      await deliverEmail(id);
    } catch (err) {
      console.error(`[email-outbox] delivery of ${id} threw`, err);
    }
  }
}

export async function runEmailRetrySweep({ limit = 25, now = new Date() }: { limit?: number; now?: Date } = {}) {
  const due = await prisma.emailDelivery.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now }, attempts: { lt: MAX_EMAIL_ATTEMPTS } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const counts = { sent: 0, failed: 0, skipped: 0 };
  for (const { id } of due) {
    try {
      counts[await deliverEmail(id, now)] += 1;
    } catch (err) {
      counts.failed += 1;
      console.error(`[email-outbox] retry of ${id} threw`, err);
    }
  }
  return { due: due.length, ...counts };
}
