// .../admin/businesses/[businessId]/reject-verification/route.ts
//
// POST { reason } -> admin rejects a pending verification request. Thin
// route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { rejectVerification } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return rejectVerification(businessId, request);
}
