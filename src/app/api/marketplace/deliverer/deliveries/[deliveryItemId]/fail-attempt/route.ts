// .../deliverer/deliveries/[deliveryItemId]/fail-attempt/route.ts
//
// POST { reason } -> deliverer reports a failed delivery attempt. Thin
// route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { reportFailedAttempt } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ deliveryItemId: string }> }) {
  const { deliveryItemId } = await params;
  return reportFailedAttempt(deliveryItemId, request);
}
