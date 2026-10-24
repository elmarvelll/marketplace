// services/marketplace/vendor/order/list-vendor-orders.ts
//
// This vendor's own orders, for information only: vendors never accept,
// reject or mark orders ready (payment confirmation confirms them, and the
// admin-run delivery operation collects them — unlike list-seller-orders.ts's
// Business equivalent). Each order shows who is collecting it; there is no
// pickup code — the vendor hands the order over and the delivery is confirmed
// by the student's code alone. Called by
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

  const orders = await prisma.order.findMany({
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
          cancelledAt: true,
          deliveryItem: { select: { delivery: { select: { deliveryman: { select: { firstName: true, lastName: true } } } } } },
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
  });

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
      // Who is collecting this order (read-only — set by the admin / roster).
      delivererName: (() => {
        const man = order.items.find((i) => i.deliveryItem)?.deliveryItem?.delivery.deliveryman;
        return man ? `${man.firstName} ${man.lastName}` : null;
      })(),
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.product?.name ?? item.side?.name ?? "Unknown item",
        quantity: item.quantity,
        price: item.price,
        deliveryStatus: item.deliveryStatus,
        rejectedAt: item.rejectedAt?.toISOString() ?? null,
        refunded: Boolean(item.rejectedAt || item.cancelledAt),
      })),
    })),
  };
}
