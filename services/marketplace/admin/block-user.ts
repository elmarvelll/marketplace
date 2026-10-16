// services/marketplace/admin/block-user.ts
//
// Admin blocks (or unblocks) a USER ACCOUNT in the Marketplace. New in the standalone app: AkadVerse can only block a
// business. The block lives in marketplace."AccountState", not on AkadVerse's User row, so it affects the Marketplace
// only — the person can still use the rest of AkadVerse (AkadVerse has no user-level block to share).
//
// What a block does: the person can't sign in to the Marketplace, and every Marketplace session they already have
// stops working on its next request (src/lib/session.ts re-checks the block each time and it bumps sessionVersion). Their data is kept — nothing
// is deleted — and businesses they own are untouched here (block those separately with block-business.ts if needed).
//
// Guard rails: an admin can't block themselves, and an admin account must have its admin status revoked before it
// can be blocked, so one admin can't silently lock another out in a single step.
// The user is emailed once per block through the outbox (same pattern as block-business.ts): the email is queued in
// the same transaction as the status change and retried if the provider fails; a failed email never undoes the block.

import { prisma } from "@/lib/prisma";
import { badRequest, conflict, notFound } from "@/lib/service-error";
import { logAdminAction } from "./shared/log-admin-action";
import { deliverEmails, enqueueEmail } from "@/services/marketplace/notifications/email-outbox";
import { accountBlockedEmail } from "@/services/marketplace/notifications/email.service";
import { getSupportContact } from "./block-business";

export async function blockUser(userId: string, reason: string, adminUserId: string): Promise<{ blocked: boolean }> {
  const trimmedReason = String(reason ?? "").trim();
  if (!trimmedReason) throw badRequest("A reason is required.");
  if (userId === adminUserId) throw badRequest("You can't block your own account.");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      isAdmin: true,
      marketplaceAccount: { select: { blocked: true } },
    },
  });
  if (!user) throw notFound("User not found.");
  if (user.isAdmin) throw conflict("This user is an administrator. Revoke their admin access before blocking them.");
  if (user.marketplaceAccount?.blocked) return { blocked: false };

  const blockedAt = new Date();
  let emailId: string | null | undefined;
  try {
    emailId = await prisma.$transaction(async (tx) => {
      const blockData = {
        blocked: true,
        blockedAt,
        blockedReason: trimmedReason,
        blockedBy: adminUserId,
      };
      // Conditional on "not blocked yet", so two concurrent blocks send one email. A row is created on first block.
      const changed = await tx.accountState.updateMany({
        where: { userId, blocked: false },
        data: { ...blockData, sessionVersion: { increment: 1 } },
      });
      if (changed.count !== 1) {
        const existing = await tx.accountState.findUnique({
          where: { userId },
          select: { blocked: true },
        });
        if (existing) return undefined;
        await tx.accountState.create({
          data: { userId, ...blockData, sessionVersion: 1 },
        });
      }
      return enqueueEmail(
        {
          dedupeKey: `user-blocked:${userId}:${blockedAt.toISOString()}`,
          to: user.email,
          ...accountBlockedEmail({
            firstName: user.firstName,
            reason: trimmedReason,
            supportContact: getSupportContact(),
          }),
        },
        tx,
      );
    });
  } catch (err) {
    // Two admins blocking the same never-blocked user at once: the second create hits the primary key. One block wins.
    if ((err as { code?: string }).code === "P2002") return { blocked: false };
    throw err;
  }
  if (emailId === undefined) return { blocked: false };

  await logAdminAction({
    adminId: adminUserId,
    action: "USER_BLOCKED",
    targetType: "user",
    targetId: userId,
    message: trimmedReason,
  });
  await deliverEmails([emailId]);
  return { blocked: true };
}

export async function unblockUser(userId: string, adminUserId: string): Promise<{ unblocked: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) throw notFound("User not found.");
  const changed = await prisma.accountState.updateMany({
    where: { userId, blocked: true },
    data: {
      blocked: false,
      blockedAt: null,
      blockedReason: null,
      blockedBy: null,
    },
  });
  if (changed.count !== 1) return { unblocked: false };
  await logAdminAction({
    adminId: adminUserId,
    action: "USER_UNBLOCKED",
    targetType: "user",
    targetId: userId,
  });
  return { unblocked: true };
}
