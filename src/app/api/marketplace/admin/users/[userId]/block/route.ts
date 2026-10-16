// POST .../admin/users/[userId]/block { reason } -> admin blocks a user account.
// See services/marketplace/admin/block-user.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { blockUser } from "@/services/marketplace/admin/block-user";

export async function POST(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<{ reason?: string }>(request);
    await blockUser(userId, body.reason ?? "", admin.user.id);
    return NextResponse.json({ message: "User blocked." });
  });
}
