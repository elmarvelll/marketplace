// .../admin/businesses/[businessId]/approve/route.ts
//
// POST -> admin approves a pending business. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { approve } from "./route.controller";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return approve(businessId);
}
