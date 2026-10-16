// services/marketplace/fines/issue-late-delivery-fine.ts
//
// Issues a late-delivery fine and restricts the business's delivery
// access. Called from confirm-order-dropoff.ts when the seller drops off
// after the 15-hour deadline, and (in future) from a deadline sweep for a
// seller who never drops off at all. See
// docs/marketplace/decisions/seller-dropoff-deadline.md.

import { prisma } from "@/lib/prisma";
import { recordOrderEvent } from "@/services/marketplace/order/record-order-event";
import { sendEmail, sellerLateDeliveryRestrictionEmail } from "@/services/marketplace/notifications/email.service";
import { LATE_DELIVERY_FINE_AMOUNT } from "./shared/constants";

export { LATE_DELIVERY_FINE_AMOUNT };

export async function issueLateDeliveryFine(businessId: string, orderId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, user: { select: { email: true } } },
  });
  if (!business) throw new Error("Business not found.");

  // Idempotent per order: don't issue a second fine for the same order if
  // this is somehow triggered twice.
  const existing = await prisma.lateDeliveryFine.findFirst({ where: { orderId, status: "PENDING" } });
  if (existing) return existing;

  const fine = await prisma.$transaction(async (tx) => {
    const created = await tx.lateDeliveryFine.create({
      data: { businessId, orderId, amount: LATE_DELIVERY_FINE_AMOUNT, status: "PENDING" },
    });
    await tx.business.update({
      where: { id: businessId },
      data: { deliveryRestricted: true, deliveryRestrictedAt: new Date(), lateDeliveryCount: { increment: 1 } },
    });
    await recordOrderEvent(tx, { orderId, type: "LATE_DELIVERY_FINE_ISSUED", actorType: "system", message: `Fine ₦${LATE_DELIVERY_FINE_AMOUNT}` });
    await recordOrderEvent(tx, { orderId, type: "BUSINESS_DELIVERY_RESTRICTED", actorType: "system" });
    return created;
  });

  if (business.user?.email) {
    void sendEmail({
      to: business.user.email,
      ...sellerLateDeliveryRestrictionEmail({ businessName: business.name, fineAmount: LATE_DELIVERY_FINE_AMOUNT }),
    });
  }

  return fine;
}
