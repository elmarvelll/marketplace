// src/types/order.ts
//
// Shared shapes for the business dashboard's Orders tab
// (src/app/business/[id]/orders/page.tsx) and
// GET /api/marketplace/businesses/[id]/orders — see
// docs/marketplace/systems/seller-order-system.md.

import type { SellerOrderSection } from "@/services/marketplace/order/seller-order-sections.service";

export interface BusinessOrderItemSummary {
  id: string;
  productName: string;
  quantity: number;
  price: number;
  deliveryStatus: string | null;
  rejectedAt: string | null;
}

export interface BusinessOrderSummary {
  id: string;
  status: string;
  fulfillmentStatus: string | null;
  section: SellerOrderSection;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
  rejectionReason: string | null;
  estimatedDeliveryAt: string | null;
  deliveryWindowStart: string | null;
  deliveryWindowEnd: string | null;
  sellerMarkedReadyAt: string | null;
  // Seller -> Coordinator OTP handoff — see
  // services/marketplace/order/initiate-order-dropoff.ts and
  // services/marketplace/delivery/confirm-seller-dropoff.ts. dropoffOtp is
  // only ever non-null for the seller who owns this order, between
  // requesting the handoff and the coordinator verifying it.
  dropoffOtp: string | null;
  dropoffOtpExpiry: string | null;
  sellerDroppedOffAt: string | null;
  coordinatorReceivedAt: string | null;
  // "Ready and dropped at the drop-off point 15 hours before the start of
  // the new day" — see services/marketplace/delivery/dropoff-deadline.service.ts. Shown so a seller in
  // Accepted/Processing can see their deadline before they miss it.
  dropoffDeadline: string | null;
  missedDropoffDeadline: boolean;
  items: BusinessOrderItemSummary[];
}
