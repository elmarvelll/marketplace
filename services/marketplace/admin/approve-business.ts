// services/marketplace/admin/approve-business.ts
//
// Admin approves a PENDING_APPROVAL business (or School Vendor — same row,
// different `type`): it becomes live on the marketplace and the owner is
// emailed + notified. Called by
// src/app/api/marketplace/admin/businesses/[businessId]/approve/route.controller.ts.
//
// Ordering and idempotency:
//  - The approval is COMMITTED first (a conditional update), and only the
//    request that actually changed the status goes on to notify — a
//    double-click or retried request can't produce a second notification, and
//    a notification can never point at a business that isn't approved yet.
//  - The notification/email link comes from ownerDashboardPath(business): a
//    School Vendor's dashboard is /vendor-dashboard/[id], not /business/[id].
//    Linking vendors to the Business route was the cause of "This business
//    doesn't exist, or isn't yours." after approval.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";
import { logAdminAction } from "./shared/log-admin-action";
import { sendEmail, businessApprovedEmail, appUrl } from "@/services/marketplace/notifications/email.service";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { ownerDashboardPath } from "@/services/marketplace/business/owner-dashboard-path";

export async function approveBusiness(businessId: string, adminUserId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, type: true, name: true, userId: true, user: { select: { email: true } } },
  });
  if (!business) throw notFound("Business not found.");

  const changed = await prisma.business.updateMany({
    where: { id: businessId, approvalStatus: { not: "APPROVED" } },
    data: { approvalStatus: "APPROVED", approvedAt: new Date(), approvedBy: adminUserId, rejectedAt: null, rejectionReason: null },
  });
  if (changed.count !== 1) return; // already approved — nothing new to announce

  await logAdminAction({ adminId: adminUserId, action: "BUSINESS_APPROVED", targetType: "business", targetId: businessId, message: business.name });

  const dashboardPath = ownerDashboardPath(business);
  if (business.user?.email) {
    void sendEmail({ to: business.user.email, ...businessApprovedEmail({ businessName: business.name, businessId, dashboardUrl: appUrl(dashboardPath) }) });
  }
  await createNotification({
    recipientId: business.userId,
    type: "BUSINESS_APPROVED",
    title: business.type === "SCHOOL_VENDOR" ? "Vendor application approved" : "Business approved",
    message: `${business.name} has been approved and is now live on the marketplace.`,
    targetUrl: dashboardPath,
    businessId,
  });
}
