// services/marketplace/delivery/shared/require-delivery-item.ts
//
// Loads a deliverer-owned DeliveryItem with everything mark-out-for-delivery.ts,
// confirm-delivery.ts, and report-failed-attempt.ts each need, or throws
// 404 — shared so the three actions can never diverge on what "this
// deliverer's item" means.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";

export async function requireDeliveryItem(delivererId: string, deliveryItemId: string) {
  const deliveryItem = await prisma.deliveryItem.findFirst({
    where: { id: deliveryItemId, delivery: { deliverymanId: delivererId } },
    select: {
      id: true,
      status: true,
      orderItemId: true,
      orderItem: {
        select: {
          orderId: true,
          price: true,
          quantity: true,
          failedDeliveryAttempts: true,
          deliveryOtp: true,
          deliveryOtpExpiry: true,
          deliveryOtpAttempts: true,
          order: {
            select: {
              businessId: true,
              business: { select: { name: true, user: { select: { email: true } } } },
              userId: true,
              user: { select: { email: true } },
            },
          },
        },
      },
    },
  });
  if (!deliveryItem) throw notFound("Delivery item not found.");
  return deliveryItem;
}
