// .../admin/businesses/[businessId]/reject/route.ts
//
// POST { reason } -> admin rejects a pending business. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { reject } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return reject(businessId, request);
}
