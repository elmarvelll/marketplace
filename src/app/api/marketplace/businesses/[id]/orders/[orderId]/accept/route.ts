// src/app/api/marketplace/businesses/[id]/orders/[orderId]/accept/route.ts
//
// POST -> seller accepts a PENDING_SELLER order. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { acceptOrder } from "./route.controller";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; orderId: string }> }) {
  const { id, orderId } = await params;
  return acceptOrder(id, orderId);
}
