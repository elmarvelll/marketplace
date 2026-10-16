// services/marketplace/business/request-verification.ts
//
// The owner-triggered "Get Verified" action — gated on >=20 completed
// orders (Order.deliveryOutcome === "DELIVERED"), blocks a second request
// while one is already PENDING. Called by
// src/app/api/marketplace/businesses/[id]/verification-request/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, conflict } from "@/lib/service-error";
import { sendEmail, businessVerificationRequestEmail, getAdminEmail } from "@/services/marketplace/notifications/email.service";
import { notifyAdmins } from "@/services/marketplace/notifications/notification.service";

const VERIFICATION_ORDER_THRESHOLD = 20;

export async function requestVerification(businessId: string, ownerUserId: string) {
  const business = await prisma.business.findFirst({
    where: { id: businessId, userId: ownerUserId },
    select: {
      id: true,
      name: true,
      verified: true,
      orders: { where: { deliveryOutcome: "DELIVERED" }, select: { id: true } },
    },
  });
  if (!business) throw notFound("Business not found.");
  if (business.verified) throw conflict("This business is already verified.");

  const completedOrders = business.orders.length;
  if (completedOrders < VERIFICATION_ORDER_THRESHOLD) {
    throw conflict(`You need at least ${VERIFICATION_ORDER_THRESHOLD} completed orders to request verification.`);
  }

  const existingPending = await prisma.businessVerificationRequest.findFirst({ where: { businessId, status: "PENDING" } });
  if (existingPending) throw conflict("A verification request is already pending for this business.");

  const request = await prisma.businessVerificationRequest.create({ data: { businessId } });

  const adminEmail = getAdminEmail();
  if (adminEmail) {
    void sendEmail({
      to: adminEmail,
      ...businessVerificationRequestEmail({ businessName: business.name, completedOrders, businessId }),
    });
  }
  await notifyAdmins({
    type: "BUSINESS_VERIFICATION_REQUESTED",
    title: "New verification request",
    message: `${business.name} has requested verification (${completedOrders} completed orders).`,
    targetUrl: "/admin/verifications",
    businessId,
  });

  return { requestId: request.id, status: request.status };
}
