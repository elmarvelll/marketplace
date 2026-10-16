// services/marketplace/admin/unblock-business.ts
//
// Reverses block-business.ts — added alongside it since a block an admin
// can never undo would be a dead end for a business that was blocked in
// error. Called by
// src/app/api/marketplace/admin/businesses/[businessId]/unblock/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";
import { logAdminAction } from "./shared/log-admin-action";

export async function unblockBusiness(businessId: string, adminUserId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true, name: true, blocked: true } });
  if (!business) throw notFound("Business not found.");
  if (!business.blocked) return;

  await prisma.business.update({ where: { id: businessId }, data: { blocked: false, blockedAt: null, blockedReason: null, blockedBy: null } });
  await logAdminAction({ adminId: adminUserId, action: "BUSINESS_UNBLOCKED", targetType: "business", targetId: businessId, message: business.name });
}
