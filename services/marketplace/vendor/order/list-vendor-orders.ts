// services/marketplace/vendor/order/list-vendor-orders.ts
//
// This vendor's own orders (spec §6: vendor just sees the order — no
// accept/reject controls, unlike list-seller-orders.ts's Business
// equivalent). Once a deliverer is assigned to collect from this vendor
// (Delivery_x_businesses — the same handoff record Business's central
// coordinator used, reused unchanged here per
// docs/marketplace/decisions/vendor-independent-architecture.md), the
// pickup code is surfaced here so the VENDOR can show it to the deliverer
// at their own location — there is no coordinator screen for vendor
// pickups. Called by
// src/app/api/marketplace/vendor/[id]/orders/route.controller.ts.
//
// Includes each order's delivery date + timeframe (via its
// VendorDeliveryBooking) so the frontend can group "September 10 -> 5-6PM
// -> Order #1001…" (spec §8). Orders are returned NEWEST-first (createdAt
// desc, id desc) and the frontend keeps that order — never re-sorted by
// name/customer.

import { prisma } from "@/lib/prisma";
import { requireOwnedVendor } from "@/services/marketplace/vendor/shared/require-owned-vendor";
import { PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";

export async function listVendorOrders(businessId: string) {
  await requireOwnedVendor(businessId);

  const [orders, handoffs] = await Promise.all([
    prisma.order.findMany({
      // Paid orders only — an abandoned/failed/unpaid checkout never reaches
      // the vendor (order/shared/paid-order.ts).
      where: { businessId, ...PAID_ORDER },
      select: {
        id: true,
        status: true,
        fulfillmentStatus: true,
        deliveryOutcome: true,
        totalAmount: true,
        createdAt: true,
        sellerMarkedReadyAt: true,
        deliveryLocation: true,
        isDisputed: true,
        vendorDeliveryBooking: { select: { bookedFor: true, slot: { select: { id: true, label: true, windowStart: true } } } },
        items: {
          select: {
            id: true,
            quantity: true,
            price: true,
            deliveryStatus: true,
            rejectedAt: true,
            product: { select: { name: true } },
            side: { select: { name: true } },
          },
        },
      },
      // Newest first, by the authoritative creation timestamp (NOT the
      // scheduled delivery date), sorted in the database; id is the
      // deterministic tie-break for identical timestamps. Supersedes the
      // earlier oldest-first rule — see
      // docs/AKADVERSE_IMPLEMENTATION_CHANGELOG.md, section E.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    // Every currently-uncollected handoff for this vendor — used to show
    // "deliverer assigned, here's the pickup code" instead of a
    // coordinator's screen. A handoff isn't tied to one specific order (it
    // covers every ready item for this business the deliverer is
    // collecting in one run), so it's surfaced at the vendor level, not
    // per-order.
    prisma.delivery_x_businesses.findMany({
      where: { businessId, delivererConfirmedPickupAt: null },
      select: {
        id: true,
        pickupOtp: true,
        pickupOtpExpiry: true,
        deliveryman: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    orders: orders.map((order) => ({
      id: order.id,
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
      deliveryOutcome: order.deliveryOutcome,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt.toISOString(),
      sellerMarkedReadyAt: order.sellerMarkedReadyAt?.toISOString() ?? null,
      deliveryLocation: order.deliveryLocation,
      isDisputed: order.isDisputed,
      bookedFor: order.vendorDeliveryBooking?.bookedFor.toISOString() ?? null,
      slot: order.vendorDeliveryBooking?.slot ?? null,
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.product?.name ?? item.side?.name ?? "Unknown item",
        quantity: item.quantity,
        price: item.price,
        deliveryStatus: item.deliveryStatus,
        rejectedAt: item.rejectedAt?.toISOString() ?? null,
      })),
    })),
    pendingPickups: handoffs.map((h) => ({
      id: h.id,
      pickupOtp: h.pickupOtp,
      pickupOtpExpiry: h.pickupOtpExpiry?.toISOString() ?? null,
      delivererName: `${h.deliveryman.firstName} ${h.deliveryman.lastName}`,
    })),
  };
}
