// .../admin/deliverers/[delivererId]/approve/route.ts
//
// POST -> admin approves a pending deliverer application. Thin route —
// see ./route.controller.ts.

import { NextRequest } from "next/server";
import { approveDeliverer } from "./route.controller";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ delivererId: string }> }) {
  const { delivererId } = await params;
  return approveDeliverer(delivererId);
}
