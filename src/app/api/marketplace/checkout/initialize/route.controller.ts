// src/app/api/marketplace/checkout/initialize/route.controller.ts
//
// Controller for POST /api/marketplace/checkout/initialize. See
// services/marketplace/checkout/create-orders-for-checkout.ts.
//
// Initializing a checkout reserves stock and records a payment attempt; it
// never marks anything paid. The response carries the Paystack publishable
// key for the SAME mode (test/live) the server will verify in, so the browser
// popup and the server can't disagree (see src/lib/external/paystack.ts).

import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { unauthorized, badRequest } from "@/lib/service-error";
import { getPaystackPublicKey } from "@/lib/external/paystack";
import { createOrdersForCheckout, EmptyCartError } from "@/services/marketplace/checkout/create-orders-for-checkout";
import { reconcileUserPendingCheckouts } from "@/services/marketplace/checkout/reconcile-user-pending-checkouts";
import { scheduleCheckoutBackgroundWork } from "@/lib/schedule-checkout-background";
import { CHECKOUT_CURRENCY } from "@/services/marketplace/checkout/shared/checkout-payment-config";

export async function initializeCheckout(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const session = await getActiveSession();
    if (!session?.user?.id) throw unauthorized();

    const body = await readJsonBody<{ location?: string }>(request);

    // Settle this buyer's earlier unpaid attempt (if any) before reserving
    // again — see reconcile-user-pending-checkouts.ts.
    const prior = await reconcileUserPendingCheckouts(session.user.id, "BUSINESS");
    const emailIds = prior.paid.flatMap((p) => p.emailIds);
    scheduleCheckoutBackgroundWork({ emailIds, sweep: true });

    try {
      const { reference, amountKobo } = await createOrdersForCheckout(session.user.id, body.location?.trim() ?? "");
      return NextResponse.json({ reference, amountKobo, email: session.user.email, currency: CHECKOUT_CURRENCY, publicKey: getPaystackPublicKey() });
    } catch (err) {
      if (err instanceof EmptyCartError) throw badRequest(err.message);
      throw err;
    }
  });
}
