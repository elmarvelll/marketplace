// POST .../admin/users/[userId]/unblock -> admin lifts a user block.
// See services/marketplace/admin/block-user.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { unblockUser } from "@/services/marketplace/admin/block-user";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return runController(async () => {
    const admin = await requireAdmin();
    await unblockUser(userId, admin.user.id);
    return NextResponse.json({ message: "User unblocked." });
  });
}
