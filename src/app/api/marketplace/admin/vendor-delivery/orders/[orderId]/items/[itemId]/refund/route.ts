// .../orders/[orderId]/items/[itemId]/refund/route.ts
//
// POST -> refunds one item on a vendor order (spec §29-31). Thin route —
// see ./route.controller.ts.

import { NextRequest } from "next/server";
import { refundItem } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ orderId: string; itemId: string }> }) {
  const { orderId, itemId } = await params;
  return refundItem(request, orderId, itemId);
}
