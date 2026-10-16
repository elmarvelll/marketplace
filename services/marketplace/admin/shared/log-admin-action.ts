// services/marketplace/admin/shared/log-admin-action.ts
//
// Writes one AdminActionLog row — shared by every admin action that isn't
// scoped to a single Order (which already has OrderEvent for this). Kept
// deliberately tiny: `action` is a free-text label (not an enum, unlike
// OrderEventType) since this log is for human review, not for driving any
// business-logic branching.

import { prisma } from "@/lib/prisma";

export async function logAdminAction(params: { adminId: string; action: string; targetType: string; targetId: string; message?: string }) {
  await prisma.adminActionLog.create({
    data: {
      adminId: params.adminId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      message: params.message,
    },
  });
}
