// .../vendor-checkout/initialize/route.controller.ts
//
// Controller for POST /api/marketplace/vendor-checkout/initialize. See
// services/marketplace/vendor-checkout/create-vendor-orders-for-checkout.ts.
// Mirrors src/app/api/marketplace/checkout/initialize/route.controller.ts's
// shape exactly (same response shape: reference/amountKobo/email/currency/
// publicKey) so the frontend's Paystack popup wiring is identical between
// Business and Vendor checkout.

import { NextRequest, NextResponse } from "next/server";
import { getActiveSession } from "@/lib/session";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { unauthorized, badRequest } from "@/lib/service-error";
import { getPaystackPublicKey } from "@/lib/external/paystack";
import { createVendorOrdersForCheckout, EmptyCartError } from "@/services/marketplace/vendor-checkout/create-vendor-orders-for-checkout";
import { reconcileUserPendingCheckouts } from "@/services/marketplace/checkout/reconcile-user-pending-checkouts";
import { scheduleCheckoutBackgroundWork } from "@/lib/schedule-checkout-background";
import { CHECKOUT_CURRENCY } from "@/services/marketplace/checkout/shared/checkout-payment-config";

export async function initializeVendorCheckout(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const session = await getActiveSession();
    if (!session?.user?.id) throw unauthorized();

    const body = await readJsonBody<{ slotId?: string; location?: string; date?: string }>(request);
    if (!body.slotId?.trim()) throw badRequest("slotId is required.");

    // Settle this buyer's earlier unpaid vendor attempt first, so a retry
    // doesn't hold two delivery-capacity units or double-reserve stock.
    const prior = await reconcileUserPendingCheckouts(session.user.id, "VENDOR");
    const emailIds = prior.paid.flatMap((p) => p.emailIds);
    scheduleCheckoutBackgroundWork({ emailIds, sweep: true });

    try {
      const { reference, amountKobo } = await createVendorOrdersForCheckout(session.user.id, {
        slotId: body.slotId.trim(),
        location: body.location?.trim() ?? "",
        date: body.date?.trim(),
      });
      return NextResponse.json({ reference, amountKobo, email: session.user.email, currency: CHECKOUT_CURRENCY, publicKey: getPaystackPublicKey() });
    } catch (err) {
      if (err instanceof EmptyCartError) throw badRequest(err.message);
      throw err;
    }
  });
}
