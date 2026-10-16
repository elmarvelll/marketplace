// .../admin/deliverers/[delivererId]/reject/route.ts
//
// POST { reason } -> admin rejects a pending deliverer application. Thin
// route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { rejectDeliverer } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ delivererId: string }> }) {
  const { delivererId } = await params;
  return rejectDeliverer(delivererId, request);
}
