// .../admin/users/[userId]/revoke-admin/route.controller.ts
//
// Controller for POST .../users/[userId]/revoke-admin. See
// services/marketplace/admin/revoke-admin.ts.
//
// Same identity guarantees as the promote route: the target user id comes
// from the URL, the requesting admin comes only from requireAdmin()'s
// server-side session lookup — no client-supplied field can affect either.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { revokeAdmin as revokeAdminAction } from "@/services/marketplace/admin/revoke-admin";

export async function revokeAdmin(userId: string): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    await revokeAdminAction(userId, admin.user.id);
    return NextResponse.json({ message: "Admin access removed." });
  });
}
