// services/marketplace/delivery/shared/ready-item-filter.ts
//
// The "eligible for delivery-coordinator assignment" filter, shared by
// list-ready-items.ts and assign-delivery.ts so they can never drift apart
// on what counts as ready.
//
// deliveryStatus: null covers both a never-yet-assigned item and one
// that's been returned to the pool by the delivery-retry cron after a
// first failed attempt — neither has an active DeliveryItem, so
// fulfillmentStatus isn't part of the Business branch's gate below: a
// retried item's Order is still HANDED_TO_DELIVERER from its first
// (failed) run, but the item itself is exactly as eligible for
// reassignment as a fresh one.
//
// Business vs. Vendor readiness differ (spec §7-8; see
// docs/marketplace/decisions/vendor-independent-architecture.md): a
// Business item is only ready once the seller has physically dropped it
// off at the central coordinator point (sellerDroppedOffAt, OTP-confirmed)
// — there is no such point for a vendor. A vendor item is ready the
// moment the vendor marks the order READY_FOR_PICKUP (see
// mark-vendor-order-ready.ts); the deliverer then collects directly from
// the vendor's own location instead of a coordinator.
import type { Prisma } from "@prisma/client";

export const READY_ITEM_WHERE: Prisma.OrderItemWhereInput = {
  deliveryStatus: null,
  rejectedAt: null,
  cancelledAt: null,
  OR: [
    { order: { business: { type: "BUSINESS" }, sellerDroppedOffAt: { not: null } } },
    { order: { business: { type: "SCHOOL_VENDOR" }, fulfillmentStatus: "READY_FOR_PICKUP" } },
  ],
};
