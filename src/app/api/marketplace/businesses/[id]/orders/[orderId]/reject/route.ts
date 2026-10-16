// src/app/api/marketplace/businesses/[id]/orders/[orderId]/reject/route.ts
//
// POST { reason } -> seller rejects a PENDING_SELLER order outright. Thin
// route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { rejectOrder } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; orderId: string }> }) {
  const { id, orderId } = await params;
  return rejectOrder(id, orderId, request);
}
