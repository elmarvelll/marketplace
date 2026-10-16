// services/marketplace/admin/reject-verification-request.ts
//
// Admin rejects a business's pending verification request, with a reason.
// Business.verified is untouched (it was never true) — the seller can
// submit a new request later once eligible again. Called by
// src/app/api/marketplace/admin/businesses/[businessId]/reject-verification/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, badRequest, conflict } from "@/lib/service-error";
import { logAdminAction } from "./shared/log-admin-action";
import { sendEmail, businessVerificationRejectedEmail } from "@/services/marketplace/notifications/email.service";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { ownerDashboardPath } from "@/services/marketplace/business/owner-dashboard-path";

export async function rejectVerificationRequest(businessId: string, reason: string, adminUserId: string) {
  if (!reason.trim()) throw badRequest("A rejection reason is required.");

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, type: true, name: true, userId: true, user: { select: { email: true } } },
  });
  if (!business) throw notFound("Business not found.");

  const pending = await prisma.businessVerificationRequest.findFirst({ where: { businessId, status: "PENDING" } });
  if (!pending) throw conflict("This business has no pending verification request.");

  await prisma.businessVerificationRequest.update({
    where: { id: pending.id },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewedBy: adminUserId, rejectionReason: reason.trim() },
  });
  await logAdminAction({
    adminId: adminUserId,
    action: "BUSINESS_VERIFICATION_REJECTED",
    targetType: "business",
    targetId: businessId,
    message: reason.trim(),
  });

  if (business.user?.email) {
    void sendEmail({ to: business.user.email, ...businessVerificationRejectedEmail({ businessName: business.name, reason: reason.trim() }) });
  }
  await createNotification({
    recipientId: business.userId,
    type: "BUSINESS_VERIFICATION_REJECTED",
    title: "Verification not approved",
    message: `Your verification request for ${business.name} was not approved: ${reason.trim()}`,
    // Business vs School Vendor dashboards are different routes — never hardcode one (owner-dashboard-path.ts).
    targetUrl: ownerDashboardPath(business),
    businessId,
  });
}
