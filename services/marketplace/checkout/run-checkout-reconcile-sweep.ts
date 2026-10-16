// services/marketplace/checkout/run-checkout-reconcile-sweep.ts
//
// Releases (or, if they were actually paid, finalizes) checkouts whose
// reservation has expired, so abandoned checkouts don't hold stock forever
// even when the buyer's browser never reported the cancellation. Also adopts
// legacy pending orders from before CheckoutPayment existed (see
// ensure-checkout-payment.ts) once they're older than the reservation TTL.
//
// Runs from /api/cron/checkout-reconcile and, opportunistically, in after()
// following checkout requests — vercel.json can't hold more frequent crons on
// the current plan (see docs/AKADVERSE_IMPLEMENTATION_CHANGELOG.md, section I).
// Bounded per run (`limit`), each reference reconciled independently so one
// provider error never blocks the rest. Safe to run concurrently: every state
// change underneath is a conditional update.

import { prisma } from "@/lib/prisma";
import { ORDER_PAYMENT_STATUS } from "@/services/marketplace/order/shared/paid-order";
import { liveReservationCutoff } from "./shared/checkout-payment-config";
import { reconcileCheckoutPayment, type ReconcileResult } from "./reconcile-checkout-payment";

export async function runCheckoutReconcileSweep({ limit = 20, now = new Date() }: { limit?: number; now?: Date } = {}) {
  const due = await prisma.checkoutPayment.findMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    orderBy: { expiresAt: "asc" },
    take: limit,
    select: { reference: true },
  });

  const legacy = await prisma.order.findMany({
    where: { paymentStatus: ORDER_PAYMENT_STATUS.PENDING, paystackReference: { not: null }, createdAt: { lte: liveReservationCutoff(now) } },
    distinct: ["paystackReference"],
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { paystackReference: true },
  });
  const adopted = new Set(
    (
      await prisma.checkoutPayment.findMany({
        where: { reference: { in: legacy.map((o) => o.paystackReference!) } },
        select: { reference: true },
      })
    ).map((p) => p.reference)
  );

  const references = Array.from(new Set([...due.map((p) => p.reference), ...legacy.map((o) => o.paystackReference!).filter((r) => !adopted.has(r))])).slice(0, limit);

  const counts: Partial<Record<ReconcileResult["state"] | "error", number>> = {};
  const emailIds: string[] = [];
  for (const reference of references) {
    try {
      const result = await reconcileCheckoutPayment(reference, "sweep", { now });
      counts[result.state] = (counts[result.state] ?? 0) + 1;
      if (result.state === "paid") emailIds.push(...result.emailIds);
    } catch (err) {
      counts.error = (counts.error ?? 0) + 1;
      console.error(`[checkout-reconcile] ${reference} failed`, err);
    }
  }
  return { checked: references.length, counts, emailIds };
}
