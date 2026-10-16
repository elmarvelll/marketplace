// services/marketplace/admin/block-business.ts
//
// Admin blocks a business (or School Vendor). This is a flag, never a delete
// — the business's products/orders/events/fines all remain in the database
// exactly as they were. Called by
// src/app/api/marketplace/admin/businesses/[businessId]/block/route.controller.ts.
//
// What a block does (enforced server-side by is-business-open.ts and both
// checkout transactions, not just hidden in the UI): the storefront and its
// products disappear from browse/search, nothing new can be added to a cart
// or checked out. The owner keeps dashboard access to fulfil already-paid
// orders.
//
// The owner is told by email, exactly once per block:
//  - The status change is a conditional update (blocked: false -> true), so
//    a repeated request / double-click changes nothing and returns before
//    any email is queued.
//  - The email is queued in the SAME transaction through the outbox
//    (email-outbox.ts), keyed by this block's own timestamp. If the provider
//    is down the block still stands and the email is retried later; it is
//    never the other way round.
//  - Only the reason the admin typed is included — no internal notes.

import { prisma } from "@/lib/prisma";
import { notFound, badRequest } from "@/lib/service-error";
import { logAdminAction } from "./shared/log-admin-action";
import { enqueueEmail, deliverEmails } from "@/services/marketplace/notifications/email-outbox";
import { businessBlockedEmail } from "@/services/marketplace/notifications/email.service";
import { createNotification } from "@/services/marketplace/notifications/notification.service";
import { ownerDashboardPath } from "@/services/marketplace/business/owner-dashboard-path";

// Where a blocked owner can ask for clarification. SUPPORT_CONTACT (an email
// address or https URL) if configured, else the existing ADMIN_EMAIL inbox.
export function getSupportContact(): string | null {
  return process.env.SUPPORT_CONTACT?.trim() || process.env.ADMIN_EMAIL?.trim() || null;
}

export async function blockBusiness(businessId: string, reason: string, adminUserId: string): Promise<{ blocked: boolean; emailId: string | null }> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw badRequest("A reason is required.");

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, type: true, name: true, userId: true, blocked: true, user: { select: { email: true } } },
  });
  if (!business) throw notFound("Business not found.");
  if (business.blocked) return { blocked: false, emailId: null };

  const blockedAt = new Date();
  const emailId = await prisma.$transaction(async (tx) => {
    const changed = await tx.business.updateMany({
      where: { id: businessId, blocked: false },
      data: { blocked: true, blockedAt, blockedReason: trimmedReason, blockedBy: adminUserId },
    });
    if (changed.count !== 1) return undefined; // a concurrent request blocked it first

    if (!business.user?.email) return null;
    return enqueueEmail(
      {
        dedupeKey: `business-blocked:${businessId}:${blockedAt.toISOString()}`,
        to: business.user.email,
        ...businessBlockedEmail({ businessName: business.name, reason: trimmedReason, supportContact: getSupportContact() }),
      },
      tx
    );
  });
  if (emailId === undefined) return { blocked: false, emailId: null };

  await logAdminAction({ adminId: adminUserId, action: "BUSINESS_BLOCKED", targetType: "business", targetId: businessId, message: trimmedReason });

  // Everything below is best-effort: the block is already committed.
  try {
    await createNotification({
      recipientId: business.userId,
      type: "BUSINESS_BLOCKED",
      title: "Business blocked",
      message: `${business.name} has been blocked by an administrator: ${trimmedReason}`,
      targetUrl: ownerDashboardPath(business),
      businessId,
    });
  } catch (err) {
    console.error(`[block-business] in-app notification for ${businessId} failed`, err);
  }
  await deliverEmails([emailId]);

  return { blocked: true, emailId };
}
