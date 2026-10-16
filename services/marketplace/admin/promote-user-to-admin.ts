// services/marketplace/admin/promote-user-to-admin.ts
//
// Grants an existing user admin access by setting `User.isAdmin = true` —
// independent of their `role` (a student, faculty, admin, or super_admin
// account can independently also be an admin; see
// docs/admin/decisions/admin-flag-replaces-role-check.md). The requesting
// admin's identity comes from the server session (services/marketplace/admin/shared,
// via requireAdmin() in the controller) — the target user id is the only
// thing the client controls, and it's validated to actually exist before
// anything changes. Called by
// src/app/api/marketplace/admin/users/[userId]/promote/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, conflict } from "@/lib/service-error";
import { logAdminAction } from "./shared/log-admin-action";

export async function promoteUserToAdmin(targetUserId: string, adminUserId: string) {
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, isAdmin: true, email: true } });
  if (!target) throw notFound("User not found.");
  if (target.isAdmin) throw conflict("This user is already an admin.");

  await prisma.user.update({ where: { id: targetUserId }, data: { isAdmin: true } });
  await logAdminAction({
    adminId: adminUserId,
    action: "USER_PROMOTED_TO_ADMIN",
    targetType: "user",
    targetId: targetUserId,
    message: `Granted admin access to ${target.email}.`,
  });
}
