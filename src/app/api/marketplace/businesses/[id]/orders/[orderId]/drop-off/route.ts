// src/app/api/marketplace/businesses/[id]/orders/[orderId]/drop-off/route.ts
//
// POST -> seller confirms drop-off at the central drop-off point. Thin
// route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { confirmDropoff } from "./route.controller";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; orderId: string }> }) {
  const { id, orderId } = await params;
  return confirmDropoff(id, orderId);
}
