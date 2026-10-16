// src/app/api/marketplace/checkout/cancel/route.controller.ts
//
// Controller for POST /api/marketplace/checkout/cancel { reference } — the
// checkout pages call this when the Paystack popup is closed without a
// success callback.
//
// "Cancelled" is the browser's claim, so it is checked with Paystack before
// anything is released:
//   - Paystack says nothing was paid  -> the stock (and vendor capacity) this
//     checkout reserved is released, exactly once; the cart is untouched.
//   - Paystack says it WAS paid       -> the order is finalized instead (200
//     status "success") — a successful purchase is never discarded.
//   - still in flight / Paystack unreachable -> nothing changes (202/503);
//     the reconciler settles it when the reservation expires.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody, requireSessionUserId } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { loadOwnedCheckoutPayment } from "@/services/marketplace/checkout/load-owned-checkout-payment";
import { reconcileLoadedPayment } from "@/services/marketplace/checkout/reconcile-checkout-payment";
import { scheduleCheckoutBackgroundWork } from "@/lib/schedule-checkout-background";
import { paymentResultResponse } from "../verify/route.controller";

export async function cancelCheckout(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const body = await readJsonBody<{ reference?: string }>(request);
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    if (!reference) throw badRequest("reference is required.");

    const payment = await loadOwnedCheckoutPayment(reference, userId);
    const result = await reconcileLoadedPayment(payment, "cancel");
    if (result.state === "paid") scheduleCheckoutBackgroundWork({ emailIds: result.emailIds });
    // A released attempt is the expected outcome of a cancel, not an error.
    if (result.state === "cancelled" || result.state === "expired" || result.state === "failed") {
      return NextResponse.json({ status: "cancelled" });
    }
    return paymentResultResponse(result);
  });
}
