// .../admin/businesses/[businessId]/unblock/route.ts
//
// POST -> admin unblocks a business. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { unblock } from "./route.controller";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return unblock(businessId);
}
