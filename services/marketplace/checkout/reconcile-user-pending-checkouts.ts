// services/marketplace/checkout/reconcile-user-pending-checkouts.ts
//
// Called at the start of a new checkout: if this buyer still has an earlier
// unpaid attempt of the same kind (they closed the popup and the browser's
// cancel call never arrived, or they're simply retrying), reconcile it with
// Paystack first. Not paid -> its reservation is released, so the retry isn't
// blocked by the buyer's own held stock/capacity and the item isn't reserved
// twice. Actually paid -> it is finalized (and the new checkout will then
// find those cart lines gone, which is correct).
//
// Bounded (short per-call timeout, small cap) and never throws: a slow or
// unreachable Paystack must not stop the buyer from checking out — an
// unresolved attempt is simply left for the reconciler sweep.

import type { CheckoutKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { reconcileLoadedPayment, type ReconcileResult } from "./reconcile-checkout-payment";

const RETRY_VERIFY_TIMEOUT_MS = 4000;
const MAX_PRIOR_ATTEMPTS = 3;

export async function reconcileUserPendingCheckouts(userId: string, kind: CheckoutKind): Promise<{ paid: Extract<ReconcileResult, { state: "paid" }>[] }> {
  const paid: Extract<ReconcileResult, { state: "paid" }>[] = [];
  try {
    const pending = await prisma.checkoutPayment.findMany({
      where: { userId, kind, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: MAX_PRIOR_ATTEMPTS,
    });
    for (const payment of pending) {
      try {
        const result = await reconcileLoadedPayment(payment, "retry", { timeoutMs: RETRY_VERIFY_TIMEOUT_MS });
        if (result.state === "paid") paid.push(result);
      } catch (err) {
        console.error(`[checkout] reconciling prior attempt ${payment.reference} failed`, err);
      }
    }
  } catch (err) {
    console.error("[checkout] loading prior attempts failed", err);
  }
  return { paid };
}
