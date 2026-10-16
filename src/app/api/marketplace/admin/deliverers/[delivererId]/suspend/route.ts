// .../admin/deliverers/[delivererId]/suspend/route.ts
//
// POST { reason } -> admin suspends a previously-approved deliverer. Thin
// route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { suspendDeliverer } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ delivererId: string }> }) {
  const { delivererId } = await params;
  return suspendDeliverer(delivererId, request);
}
