// services/marketplace/admin/verify-business.ts
//
// Admin approves a business's pending verification request (or verifies
// directly, if somehow called with no pending request — kept permissive
// since the Businesses tab's older one-click "Verify" button still calls
// this too). Idempotent — verifying an already-verified business is a
// no-op rather than an error, so a double-click can't corrupt state or
// write a duplicate audit entry. Called by
// src/app/api/marketplace/admin/businesses/[businessId]/verify/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";
import { logAdminAction } from "./shared/log-admin-action";
import { sendEmail, businessVerificationApprovedEmail } from "@/services/marketplace/notifications/email.service";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { ownerDashboardPath } from "@/services/marketplace/business/owner-dashboard-path";

export async function verifyBusiness(businessId: string, adminUserId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, type: true, name: true, userId: true, verified: true, user: { select: { email: true } } },
  });
  if (!business) throw notFound("Business not found.");
  if (business.verified) return;

  await prisma.$transaction(async (tx) => {
    await tx.business.update({ where: { id: businessId }, data: { verified: true, verifiedAt: new Date(), verifiedBy: adminUserId } });
    await tx.businessVerificationRequest.updateMany({
      where: { businessId, status: "PENDING" },
      data: { status: "APPROVED", reviewedAt: new Date(), reviewedBy: adminUserId },
    });
  });
  await logAdminAction({ adminId: adminUserId, action: "BUSINESS_VERIFIED", targetType: "business", targetId: businessId, message: business.name });

  if (business.user?.email) {
    void sendEmail({ to: business.user.email, ...businessVerificationApprovedEmail({ businessName: business.name }) });
  }
  await createNotification({
    recipientId: business.userId,
    type: "BUSINESS_VERIFIED",
    title: "Business verified",
    message: `${business.name} is now a verified business.`,
    // Business vs School Vendor dashboards are different routes — never hardcode one (owner-dashboard-path.ts).
    targetUrl: ownerDashboardPath(business),
    businessId,
  });
}
