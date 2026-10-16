// src/app/api/marketplace/checkout/verify/route.controller.ts
//
// Controller for POST /api/marketplace/checkout/verify { reference } — used
// by both the Business and the Vendor checkout pages after the Paystack
// popup reports success. See
// services/marketplace/checkout/reconcile-checkout-payment.ts.
//
// The popup's word is never trusted: this asks Paystack server-side, and the
// checkout is finalized only if the reference, amount, and currency match
// what was charged. Safe to call repeatedly (an already-finalized checkout
// returns 200 without calling Paystack again).
//
// Status codes (previously every upstream problem was a blanket 502):
//   200 success        — paid and finalized (now or earlier)
//   202 pending        — Paystack hasn't confirmed yet; nothing changed, retry
//   402 failed         — Paystack says the payment failed; reservation released
//   404 not_found      — no such checkout for this user / unknown to Paystack
//   409 needs_review   — paid but couldn't be completed automatically; admins alerted
//   410 cancelled/expired — this attempt was already released; start again
//   503 unknown        — Paystack unreachable/timeout/bad response; payment
//                        state is UNCHANGED and the call is safe to retry
//   500                — our own failure (DB, misconfiguration); logged, retryable

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody, requireSessionUserId } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { loadOwnedCheckoutPayment } from "@/services/marketplace/checkout/load-owned-checkout-payment";
import { reconcileLoadedPayment, type ReconcileResult } from "@/services/marketplace/checkout/reconcile-checkout-payment";
import { scheduleCheckoutBackgroundWork } from "@/lib/schedule-checkout-background";

export async function verifyCheckout(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const body = await readJsonBody<{ reference?: string }>(request);
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    if (!reference) throw badRequest("reference is required.");

    const payment = await loadOwnedCheckoutPayment(reference, userId);
    const result = await reconcileLoadedPayment(payment, "verify");
    if (result.state === "paid") scheduleCheckoutBackgroundWork({ emailIds: result.emailIds });
    return paymentResultResponse(result);
  });
}

// Shared with ../cancel — one mapping from a reconcile result to HTTP.
// Errors keep the `{ error }` field every existing client already reads.
export function paymentResultResponse(result: ReconcileResult): NextResponse {
  switch (result.state) {
    case "paid":
      return NextResponse.json({ status: "success", confirmedOrderIds: result.orderIds });
    case "pending":
      return NextResponse.json({ status: "pending", retryable: true, error: "Your payment hasn't been confirmed yet." }, { status: 202 });
    case "failed":
      return NextResponse.json({ status: "failed", error: "Your payment failed. You have not been charged for this order." }, { status: 402 });
    case "cancelled":
    case "expired":
      return NextResponse.json({ status: result.state, error: "This payment attempt is no longer active. Please start checkout again." }, { status: 410 });
    case "not_found":
    case "no_such_checkout":
      return NextResponse.json({ status: "not_found", error: "We couldn't find a payment for this checkout." }, { status: 404 });
    case "needs_review":
      return NextResponse.json(
        { status: "needs_review", error: "We received your payment but couldn't complete the order automatically. Our team has been notified and will contact you." },
        { status: 409 }
      );
    case "unknown":
      return NextResponse.json(
        { status: "unknown", retryable: true, error: "We couldn't reach the payment provider. Your payment status is unchanged — please try again in a moment." },
        { status: 503, headers: { "Retry-After": "5" } }
      );
  }
}
