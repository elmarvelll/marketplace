// services/marketplace/order/list-buyer-orders.ts
//
// The buyer's own order-tracking list — item-level status, since different
// items in the same order can be delivered/failed/still-processing
// independently. Called by
// src/app/api/marketplace/orders/route.controller.ts. See
// docs/marketplace/data/order-data-flow.md and
// docs/marketplace/systems/order-history-system.md.

import { prisma } from "@/lib/prisma";
import { formatEstimatedDelivery } from "@/services/marketplace/delivery/estimated-delivery.service";
import { PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";
import { getStudentDeliveryCodes } from "@/services/marketplace/vendor-delivery/handover/handover-code";

export async function listBuyerOrders(userId: string) {
  const orders = await prisma.order.findMany({
    // Paid orders only: a cancelled/failed/expired checkout attempt is an
    // internal record, never part of the buyer's order history.
    where: { userId, ...PAID_ORDER },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      fulfillmentStatus: true,
      deliveryOutcome: true,
      totalAmount: true,
      createdAt: true,
      estimatedDeliveryAt: true,
      deliveryWindowStart: true,
      deliveryWindowEnd: true,
      isDisputed: true,
      disputeResolvedAt: true,
      business: { select: { name: true, type: true } },
      vendorDeliveryBooking: { select: { id: true, status: true, bookedFor: true, slot: { select: { label: true } } } },
      items: {
        select: {
          id: true,
          quantity: true,
          price: true,
          deliveryStatus: true,
          deliveryOtp: true,
          rejectedAt: true,
          rejectionReason: true,
          cancelledAt: true,
          product: { select: { name: true } },
          side: { select: { name: true } },
        },
      },
    },
  });

  // Vendor Market: one handover code per booking, shown only to this student.
  const codes = await getStudentDeliveryCodes(
    userId,
    Array.from(new Set(orders.map((o) => o.vendorDeliveryBooking).filter((b) => b?.status === "CONFIRMED").map((b) => b!.id)))
  );

  return orders.map((order) => {
    const estimate =
      order.estimatedDeliveryAt && order.deliveryWindowStart && order.deliveryWindowEnd
        ? formatEstimatedDelivery({
            estimatedDeliveryAt: order.estimatedDeliveryAt,
            deliveryWindowStart: order.deliveryWindowStart,
            deliveryWindowEnd: order.deliveryWindowEnd,
          })
        : null;

    return {
      id: order.id,
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
      deliveryOutcome: order.deliveryOutcome,
      totalAmount: order.totalAmount,
      createdAt: order.createdAt.toISOString(),
      businessName: order.business.name,
      // Distinguishes School Vendor orders from Business orders (spec
      // §66) — see src/app/orders/page.tsx.
      businessType: order.business.type,
      estimatedDate: estimate?.date ?? null,
      deliveryWindow: estimate?.window ?? null,
      isDisputed: order.isDisputed,
      disputeResolvedAt: order.disputeResolvedAt?.toISOString() ?? null,
      vendorDelivery: order.vendorDeliveryBooking
        ? {
            reference: order.vendorDeliveryBooking.id.slice(0, 8).toUpperCase(),
            date: order.vendorDeliveryBooking.bookedFor.toISOString().slice(0, 10),
            slotLabel: order.vendorDeliveryBooking.slot.label,
            code: codes.get(order.vendorDeliveryBooking.id)?.code ?? null,
            delivered: codes.get(order.vendorDeliveryBooking.id)?.delivered ?? false,
          }
        : null,
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.product?.name ?? item.side?.name ?? "Unknown item",
        quantity: item.quantity,
        price: item.price,
        deliveryStatus: item.deliveryStatus,
        // Only ever surfaced while the item is out for delivery — see
        // docs/marketplace/security/otp-security.md.
        deliveryOtp: item.deliveryStatus === "OUT_FOR_DELIVERY" ? item.deliveryOtp : null,
        rejectedAt: item.rejectedAt?.toISOString() ?? null,
        rejectionReason: item.rejectionReason,
        cancelledAt: item.cancelledAt?.toISOString() ?? null,
      })),
    };
  });
}
