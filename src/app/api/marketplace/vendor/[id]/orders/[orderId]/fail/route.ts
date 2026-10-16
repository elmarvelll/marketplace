// .../vendor/[id]/orders/[orderId]/fail/route.ts
//
// POST -> vendor marks an order as unable to be fulfilled (refunds it).
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { markFailed } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; orderId: string }> }) {
  const { id, orderId } = await params;
  return markFailed(request, id, orderId);
}
