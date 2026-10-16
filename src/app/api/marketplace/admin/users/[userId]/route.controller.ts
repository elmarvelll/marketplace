// .../admin/users/[userId]/route.controller.ts
//
// Controller for GET .../users/[userId]. See
// services/marketplace/admin/get-user-detail.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { getUserDetail } from "@/services/marketplace/admin/get-user-detail";

export async function getUser(userId: string): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const user = await getUserDetail(userId);
    return NextResponse.json({ user });
  });
}
