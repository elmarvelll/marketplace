// .../admin/users/[userId]/promote/route.controller.ts
//
// Controller for POST .../users/[userId]/promote. See
// services/marketplace/admin/promote-user-to-admin.ts.
//
// Security note: the target user id comes from the URL; the requesting
// admin's identity comes only from requireAdmin()'s server-side session
// lookup. The request body is never trusted for either identity — there
// is no `role` field accepted from the client at all.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { promoteUserToAdmin } from "@/services/marketplace/admin/promote-user-to-admin";

export async function promoteUser(userId: string): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    await promoteUserToAdmin(userId, admin.user.id);
    return NextResponse.json({ message: "User promoted to admin." });
  });
}
