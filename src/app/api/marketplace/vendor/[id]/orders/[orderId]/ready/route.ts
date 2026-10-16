// .../vendor/[id]/orders/[orderId]/ready/route.ts
//
// POST -> vendor marks an order ready for the deliverer to collect. Thin
// route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { markReady } from "./route.controller";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; orderId: string }> }) {
  const { id, orderId } = await params;
  return markReady(id, orderId);
}
