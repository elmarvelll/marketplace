// services/marketplace/order/list-seller-orders.ts
//
// This business's orders, split into the five seller dashboard sections,
// with drop-off deadline info. Called by
// src/app/api/marketplace/businesses/[id]/orders/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { classifySellerOrder } from "@/services/marketplace/order/seller-order-sections.service";
import { getSellerDropoffDeadline, hasMissedDropoffDeadline } from "@/services/marketplace/delivery/dropoff-deadline.service";
import type { BusinessOrderSummary } from "@/types/order";
import { PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";

export async function listSellerOrders(businessId: string): Promise<BusinessOrderSummary[]> {
  const orders = await prisma.order.findMany({
    // Paid orders only — the seller never sees (or can act on) a checkout
    // that was abandoned, failed, or is still awaiting payment.
    where: { businessId, ...PAID_ORDER },
    select: {
      id: true,
      status: true,
      fulfillmentStatus: true,
      totalAmount: true,
      createdAt: true,
      rejectionReason: true,
      estimatedDeliveryAt: true,
      deliveryWindowStart: true,
      deliveryWindowEnd: true,
      sellerMarkedReadyAt: true,
      dropoffOtp: true,
      dropoffOtpExpiry: true,
      sellerDroppedOffAt: true,
      coordinatorReceivedAt: true,
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
    // Newest first; id breaks ties deterministically.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return orders.map((order) => {
    const dropoffDeadline = order.estimatedDeliveryAt ? getSellerDropoffDeadline(order.estimatedDeliveryAt) : null;
    return {
      id: order.id,
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
      section: classifySellerOrder(order.status, order.fulfillmentStatus),
      totalAmount: order.totalAmount,
      itemCount: order.items.length,
      createdAt: order.createdAt.toISOString(),
      rejectionReason: order.rejectionReason,
      estimatedDeliveryAt: order.estimatedDeliveryAt?.toISOString() ?? null,
      deliveryWindowStart: order.deliveryWindowStart?.toISOString() ?? null,
      deliveryWindowEnd: order.deliveryWindowEnd?.toISOString() ?? null,
      sellerMarkedReadyAt: order.sellerMarkedReadyAt?.toISOString() ?? null,
      // The OTP itself is only ever returned to the seller who owns this
      // order (this endpoint is business-ownership-gated) — it's what they
      // read aloud/show to the coordinator in person.
      dropoffOtp: order.dropoffOtp,
      dropoffOtpExpiry: order.dropoffOtpExpiry?.toISOString() ?? null,
      sellerDroppedOffAt: order.sellerDroppedOffAt?.toISOString() ?? null,
      coordinatorReceivedAt: order.coordinatorReceivedAt?.toISOString() ?? null,
      dropoffDeadline: dropoffDeadline?.toISOString() ?? null,
      missedDropoffDeadline:
        order.estimatedDeliveryAt !== null &&
        order.fulfillmentStatus !== "HANDED_TO_DELIVERER" &&
        hasMissedDropoffDeadline(order.estimatedDeliveryAt, order.sellerDroppedOffAt),
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.product?.name ?? item.side?.name ?? "Unknown item",
        quantity: item.quantity,
        price: item.price,
        deliveryStatus: item.deliveryStatus,
        rejectedAt: item.rejectedAt?.toISOString() ?? null,
      })),
    };
  });
}
