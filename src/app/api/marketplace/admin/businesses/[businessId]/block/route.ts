// .../admin/businesses/[businessId]/block/route.ts
//
// POST { reason } -> admin blocks a business. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { block } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return block(businessId, request);
}
