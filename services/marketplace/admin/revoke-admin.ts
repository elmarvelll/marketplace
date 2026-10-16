// services/marketplace/admin/revoke-admin.ts
//
// Removes a user's admin access by setting `User.isAdmin = false`. Added
// alongside promote-user-to-admin.ts once admin access became a plain
// boolean flag rather than a role value — a flag an admin can grant but
// never revoke would be an unnecessary dead end. Closes the "no demotion
// path" gap noted when the dashboard first shipped. Called by
// src/app/api/marketplace/admin/users/[userId]/revoke-admin/route.controller.ts.
//
// Deliberately does not prevent an admin from revoking their own access —
// requireAdmin() re-checks the flag on every request, so a self-revoke
// simply and correctly locks that admin out starting with their next
// request, the same way it would for anyone else.

import { prisma } from "@/lib/prisma";
import { notFound, conflict } from "@/lib/service-error";
import { logAdminAction } from "./shared/log-admin-action";

export async function revokeAdmin(targetUserId: string, adminUserId: string) {
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, isAdmin: true, email: true } });
  if (!target) throw notFound("User not found.");
  if (!target.isAdmin) throw conflict("This user is not currently an admin.");

  await prisma.user.update({ where: { id: targetUserId }, data: { isAdmin: false } });
  await logAdminAction({
    adminId: adminUserId,
    action: "USER_ADMIN_REVOKED",
    targetType: "user",
    targetId: targetUserId,
    message: `Removed admin access from ${target.email}.`,
  });
}
