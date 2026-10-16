// services/marketplace/checkout/reconcile-checkout-payment.ts
//
// THE entry point for "what is the real state of this checkout, and act on
// it". Every trigger goes through here, so they all apply the same rules:
//   verify  — the browser's popup reported success (POST /checkout/verify)
//   cancel  — the browser's popup was closed (POST /checkout/cancel)
//   webhook — Paystack's signed charge.success webhook
//   sweep   — the reconciler, for reservations past their expiry
//   retry   — the buyer starts a new checkout while an older one is pending
//
// The browser's own report is never proof of anything: every decision is
// made from a server-side Paystack verify call. What each Paystack answer
// does:
//   success            -> finalize (confirm-payment-by-reference.ts), any trigger
//   failed / reversed  -> release the reservation (FAILED)
//   abandoned / not_found -> release (ABANDONED) on cancel/retry, (EXPIRED) on a
//                         sweep past expiry; otherwise keep it (the popup may
//                         still be completing) and report "pending"/"not_found"
//   pending (in flight)-> keep, unless it's been pending past the hard limit
//   no answer (timeout, 5xx, garbage) -> change NOTHING, record the error,
//                         report "unknown" so the caller can retry later.

import type { CheckoutPayment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PaystackError, verifyTransaction } from "@/lib/external/paystack";
import { ensureCheckoutPayment } from "./ensure-checkout-payment";
import { confirmPaymentByReference } from "./confirm-payment-by-reference";
import { releaseCheckoutReservation } from "./release-checkout-reservation";
import { PENDING_PROVIDER_MAX_HOURS } from "./shared/checkout-payment-config";
import { logPayment } from "./shared/payment-log";

export type ReconcileTrigger = "verify" | "cancel" | "webhook" | "sweep" | "retry";

export type ReconcileResult =
  | { state: "paid"; orderIds: string[]; newlyConfirmed: boolean; emailIds: string[] }
  | { state: "needs_review"; reason: string }
  | { state: "failed" }
  | { state: "cancelled" }
  | { state: "expired" }
  | { state: "pending" }
  | { state: "not_found" }
  | { state: "unknown"; errorKind: string }
  | { state: "no_such_checkout" };

const RELEASED_STATE: Record<string, ReconcileResult> = {
  FAILED: { state: "failed" },
  ABANDONED: { state: "cancelled" },
  EXPIRED: { state: "expired" },
};

export async function reconcileCheckoutPayment(
  reference: string,
  trigger: ReconcileTrigger,
  { now = new Date(), timeoutMs }: { now?: Date; timeoutMs?: number } = {}
): Promise<ReconcileResult> {
  const payment = await ensureCheckoutPayment(reference);
  if (!payment) return { state: "no_such_checkout" };
  return reconcileLoadedPayment(payment, trigger, { now, timeoutMs });
}

export async function reconcileLoadedPayment(
  payment: CheckoutPayment,
  trigger: ReconcileTrigger,
  { now = new Date(), timeoutMs }: { now?: Date; timeoutMs?: number } = {}
): Promise<ReconcileResult> {
  // A finalized checkout never needs Paystack again — this is also what makes
  // a repeated verify call (double click, page refresh) cheap and safe.
  if (payment.status === "PAID") {
    const orders = await prisma.order.findMany({ where: { paystackReference: payment.reference }, select: { id: true } });
    return { state: "paid", orderIds: orders.map((o) => o.id), newlyConfirmed: false, emailIds: [] };
  }
  if (payment.status === "NEEDS_REVIEW") return { state: "needs_review", reason: payment.reviewReason ?? "Under review." };

  const started = Date.now();
  let verified;
  try {
    verified = await verifyTransaction(payment.reference, { timeoutMs });
  } catch (err) {
    if (!(err instanceof PaystackError)) throw err; // config errors and bugs surface as 500s
    await prisma.checkoutPayment.update({
      where: { id: payment.id },
      data: { verifyAttempts: { increment: 1 }, lastError: `${err.kind}: ${err.message}`.slice(0, 2000) },
    });
    logPayment("warn", "verify_unavailable", { reference: payment.reference, trigger, errorKind: err.kind, httpStatus: err.httpStatus, ms: Date.now() - started });
    return { state: "unknown", errorKind: err.kind };
  }
  logPayment("info", "verify_result", { reference: payment.reference, trigger, outcome: verified.outcome, providerStatus: verified.status, ms: Date.now() - started });

  if (verified.outcome === "success") {
    return confirmPaymentByReference(payment, verified);
  }

  await prisma.checkoutPayment.update({
    where: { id: payment.id },
    data: { verifyAttempts: { increment: 1 }, providerStatus: verified.status, providerCheckedAt: now, lastError: null },
  });

  // Already released (and Paystack still says not paid): nothing to do.
  if (payment.status !== "PENDING") return RELEASED_STATE[payment.status] ?? { state: "pending" };

  const expired = payment.expiresAt <= now;
  switch (verified.outcome) {
    case "failed":
      await releaseCheckoutReservation(payment.id, "FAILED", { providerStatus: verified.status });
      return { state: "failed" };
    case "abandoned":
    case "not_found":
      if (trigger === "cancel" || trigger === "retry") {
        await releaseCheckoutReservation(payment.id, "ABANDONED", { providerStatus: verified.status });
        return { state: "cancelled" };
      }
      if (trigger === "sweep" && expired) {
        await releaseCheckoutReservation(payment.id, "EXPIRED", { providerStatus: verified.status });
        return { state: "expired" };
      }
      return verified.outcome === "not_found" ? { state: "not_found" } : { state: "pending" };
    case "pending": {
      const hardLimit = new Date(payment.createdAt.getTime() + PENDING_PROVIDER_MAX_HOURS * 60 * 60 * 1000);
      if (trigger === "sweep" && hardLimit <= now) {
        await releaseCheckoutReservation(payment.id, "EXPIRED", { providerStatus: verified.status });
        return { state: "expired" };
      }
      return { state: "pending" };
    }
  }
}
