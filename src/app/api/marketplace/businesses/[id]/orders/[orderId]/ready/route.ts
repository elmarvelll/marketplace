// src/app/api/marketplace/businesses/[id]/orders/[orderId]/ready/route.ts
//
// POST -> seller marks an accepted order READY_FOR_PICKUP. Thin route —
// see ./route.controller.ts.

import { NextRequest } from "next/server";
import { markOrderReady } from "./route.controller";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; orderId: string }> }) {
  const { id, orderId } = await params;
  return markOrderReady(id, orderId);
}
