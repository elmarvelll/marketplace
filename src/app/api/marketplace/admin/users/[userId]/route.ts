// .../admin/users/[userId]/route.ts
//
// GET -> one user's detail. Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { getUser } from "./route.controller";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return getUser(userId);
}
