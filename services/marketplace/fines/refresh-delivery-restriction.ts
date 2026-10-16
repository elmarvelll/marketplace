// services/marketplace/fines/refresh-delivery-restriction.ts
//
// Removes the business's delivery restriction once every outstanding fine
// is PAID — never partially: a business can have incurred more than one
// fine, and paying one shouldn't unrestrict it while another is still due.
// Called by confirm-fine-payment.ts.

import { prisma } from "@/lib/prisma";

export async function refreshDeliveryRestriction(businessId: string) {
  const outstanding = await prisma.lateDeliveryFine.count({ where: { businessId, status: "PENDING" } });
  if (outstanding === 0) {
    await prisma.business.update({ where: { id: businessId }, data: { deliveryRestricted: false } });
  }
}
