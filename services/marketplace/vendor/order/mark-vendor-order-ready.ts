// services/marketplace/vendor/order/mark-vendor-order-ready.ts
//
// Vendor marks a (payment-auto-accepted — see
// confirm-payment-by-reference.ts) order ready for the deliverer to
// collect from the vendor's own location. Reuses
// services/marketplace/order/mark-order-ready.ts unchanged — it's already
// generic (checks status=ACCEPTED + fulfillmentStatus=PROCESSING, sets
// READY_FOR_PICKUP, notifies the buyer) and vendor orders reach exactly
// that same state at payment confirmation, just via auto-accept instead
// of a seller decision. Owner+type-scoped via requireOwnedVendor. Called
// by src/app/api/marketplace/vendor/[id]/orders/[orderId]/ready/route.controller.ts.

import { requireOwnedVendor } from "@/services/marketplace/vendor/shared/require-owned-vendor";
import { markOrderReady } from "@/services/marketplace/order/mark-order-ready";

export async function markVendorOrderReady(businessId: string, orderId: string) {
  const { session } = await requireOwnedVendor(businessId);
  await markOrderReady(businessId, orderId, session.user.id);
}
