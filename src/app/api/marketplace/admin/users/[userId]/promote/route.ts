// .../admin/users/[userId]/promote/route.ts
//
// POST -> promotes an existing user to admin. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { promoteUser } from "./route.controller";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return promoteUser(userId);
}
