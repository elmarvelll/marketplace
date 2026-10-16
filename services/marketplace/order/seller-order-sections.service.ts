// services/marketplace/order/seller-order-sections.service.ts
//
// Classifies an order into the seller dashboard's five sections (Pending,
// Accepted/Processing, Ready for Pickup, Completed, Rejected — see
// docs/marketplace/systems/seller-order-system.md). One place, so the
// dashboard route and any future summary/count endpoint agree on the same
// rule.

import type { OrderStatus, FulfillmentStatus } from "@prisma/client";

export type SellerOrderSection = "pending" | "accepted_processing" | "ready_for_pickup" | "completed" | "rejected";

export function classifySellerOrder(status: OrderStatus, fulfillmentStatus: FulfillmentStatus | null): SellerOrderSection {
  if (status === "REJECTED" || status === "CANCELLED") return "rejected";
  if (status === "PENDING_SELLER") return "pending";

  // status === "ACCEPTED" from here on.
  if (fulfillmentStatus === "HANDED_TO_DELIVERER") return "completed";
  if (fulfillmentStatus === "READY_FOR_PICKUP") return "ready_for_pickup";
  return "accepted_processing";
}
