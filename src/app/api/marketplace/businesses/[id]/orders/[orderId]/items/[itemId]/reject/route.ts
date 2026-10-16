// .../orders/[orderId]/items/[itemId]/reject/route.ts
//
// POST { reason } -> seller rejects one item of an already-accepted order.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { rejectOrderItem } from "./route.controller";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string; itemId: string }> }
) {
  const { id, orderId, itemId } = await params;
  return rejectOrderItem(id, orderId, itemId, request);
}
