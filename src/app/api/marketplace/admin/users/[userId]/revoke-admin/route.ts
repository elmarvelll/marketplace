// .../admin/users/[userId]/revoke-admin/route.ts
//
// POST -> removes a user's admin access. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { revokeAdmin } from "./route.controller";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return revokeAdmin(userId);
}
