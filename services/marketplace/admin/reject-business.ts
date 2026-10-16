// services/marketplace/admin/reject-business.ts
//
// Admin rejects a PENDING_APPROVAL business, with a reason. Rejected
// businesses stay out of the marketplace and off the owner's dashboard
// (same gating as pending — see
// services/marketplace/business/get-business-detail.ts) until reset by an
// admin. Called by
// src/app/api/marketplace/admin/businesses/[businessId]/reject/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, badRequest } from "@/lib/service-error";
import { logAdminAction } from "./shared/log-admin-action";
import { sendEmail, businessRejectedEmail } from "@/services/marketplace/notifications/email.service";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { ownerDashboardPath } from "@/services/marketplace/business/owner-dashboard-path";

export async function rejectBusiness(businessId: string, reason: string, adminUserId: string) {
  if (!reason.trim()) throw badRequest("A rejection reason is required.");

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, type: true, name: true, userId: true, user: { select: { email: true } } },
  });
  if (!business) throw notFound("Business not found.");

  await prisma.business.update({
    where: { id: businessId },
    data: { approvalStatus: "REJECTED", rejectedAt: new Date(), rejectionReason: reason.trim(), approvedAt: null, approvedBy: null },
  });
  await logAdminAction({ adminId: adminUserId, action: "BUSINESS_REJECTED", targetType: "business", targetId: businessId, message: reason.trim() });

  if (business.user?.email) {
    void sendEmail({ to: business.user.email, ...businessRejectedEmail({ businessName: business.name, reason: reason.trim() }) });
  }
  await createNotification({
    recipientId: business.userId,
    type: "BUSINESS_REJECTED",
    title: "Business not approved",
    message: `${business.name} was not approved: ${reason.trim()}`,
    // Business vs School Vendor dashboards are different routes — never hardcode one (owner-dashboard-path.ts).
    targetUrl: ownerDashboardPath(business),
    businessId,
  });
}
