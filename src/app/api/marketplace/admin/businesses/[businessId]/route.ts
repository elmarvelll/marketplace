// .../admin/businesses/[businessId]/route.ts
//
// GET -> one business's full admin detail. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { getBusiness } from "./route.controller";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return getBusiness(businessId);
}
