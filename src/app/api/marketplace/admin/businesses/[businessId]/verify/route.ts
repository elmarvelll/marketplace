// .../admin/businesses/[businessId]/verify/route.ts
//
// POST -> admin verifies a business. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { verify } from "./route.controller";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return verify(businessId);
}
