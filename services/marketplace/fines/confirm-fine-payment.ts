// services/marketplace/fines/confirm-fine-payment.ts
//
// Same idempotency pattern as
// services/marketplace/checkout/confirm-payment-by-reference.ts — only
// ever acts on a fine still PENDING for this exact reference, so the
// webhook and a client-side verify call can both safely call this for the
// same payment. The restriction is only ever removed once Paystack has
// actually confirmed the payment — never just because a payment attempt
// was opened. Called by
// src/app/api/marketplace/businesses/[id]/fines/[fineId]/verify/route.controller.ts
// and services/marketplace/payment/handle-paystack-event.ts.

import { prisma } from "@/lib/prisma";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { refreshDeliveryRestriction } from "./refresh-delivery-restriction";

export async function confirmFinePaymentByReference(reference: string): Promise<{ confirmedFineId: string | null }> {
  const fine = await prisma.lateDeliveryFine.findFirst({
    where: { paystackReference: reference, status: "PENDING" },
    select: { id: true, businessId: true, orderId: true },
  });
  if (!fine) return { confirmedFineId: null };

  await prisma.$transaction(async (tx) => {
    await tx.lateDeliveryFine.update({ where: { id: fine.id }, data: { status: "PAID", paidAt: new Date() } });
    if (fine.orderId) {
      await recordOrderEvent(tx, { orderId: fine.orderId, type: "LATE_DELIVERY_FINE_PAID", actorType: "system" });
    }
  });

  await refreshDeliveryRestriction(fine.businessId);
  if (fine.orderId) {
    await prisma.$transaction(async (tx) => {
      const stillRestricted = await tx.business.findUnique({ where: { id: fine.businessId }, select: { deliveryRestricted: true } });
      if (!stillRestricted?.deliveryRestricted) {
        await recordOrderEvent(tx, { orderId: fine.orderId!, type: "BUSINESS_DELIVERY_UNRESTRICTED", actorType: "system" });
      }
    });
  }

  return { confirmedFineId: fine.id };
}
