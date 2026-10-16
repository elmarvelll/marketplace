// services/marketplace/delivery/list-assigned-delivery-items.ts
//
// Every DeliveryItem assigned to the signed-in deliverer, across every
// status — the Deliverer Dashboard's main list. Called by
// src/app/api/marketplace/deliverer/deliveries/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { formatEstimatedDelivery } from "@/services/marketplace/delivery/estimated-delivery.service";

export async function listAssignedDeliveryItems(delivererId: string) {
  const items = await prisma.deliveryItem.findMany({
    where: { delivery: { deliverymanId: delivererId } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      quantity: true,
      businessId: true,
      // type/location so a deliverer collecting a School Vendor item sees
      // the vendor's own address as the pickup point — there is no
      // central drop-off for vendor pickups (see
      // docs/marketplace/decisions/vendor-independent-architecture.md). A
      // Business item's pickup point is still the central location
      // (unrelated to this field, sourced from MarketplaceSettings
      // elsewhere in the deliverer dashboard).
      business: { select: { name: true, type: true, location: true } },
      orderItem: {
        select: {
          id: true,
          failedDeliveryAttempts: true,
          retryDeliveryAt: true,
          product: { select: { name: true } },
          side: { select: { name: true } },
          order: { select: { id: true, deliveryLocation: true, estimatedDeliveryAt: true, deliveryWindowStart: true, deliveryWindowEnd: true } },
        },
      },
    },
  });

  return items.map((item) => {
    const order = item.orderItem.order;
    const estimate =
      order.estimatedDeliveryAt && order.deliveryWindowStart && order.deliveryWindowEnd
        ? formatEstimatedDelivery({
            estimatedDeliveryAt: order.estimatedDeliveryAt,
            deliveryWindowStart: order.deliveryWindowStart,
            deliveryWindowEnd: order.deliveryWindowEnd,
          })
        : null;

    return {
      deliveryItemId: item.id,
      status: item.status,
      quantity: item.quantity,
      businessId: item.businessId,
      businessName: item.business.name,
      businessType: item.business.type,
      // Where to COLLECT this item — the vendor's own address for a
      // School Vendor item, null for Business (collected from the
      // central drop-off point instead).
      collectionLocation: item.business.type === "SCHOOL_VENDOR" ? item.business.location : null,
      productName: item.orderItem.product?.name ?? item.orderItem.side?.name ?? "Unknown item",
      orderId: order.id,
      // Where to DELIVER this item — the buyer's destination, unchanged
      // for both Business and Vendor.
      deliveryLocation: order.deliveryLocation,
      estimatedDate: estimate?.date ?? null,
      deliveryWindow: estimate?.window ?? null,
      failedDeliveryAttempts: item.orderItem.failedDeliveryAttempts,
      retryDeliveryAt: item.orderItem.retryDeliveryAt?.toISOString() ?? null,
    };
  });
}
