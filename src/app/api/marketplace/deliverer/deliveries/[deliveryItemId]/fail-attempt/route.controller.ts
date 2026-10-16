// .../deliveries/[deliveryItemId]/fail-attempt/route.controller.ts
//
// Controller for POST .../fail-attempt. See
// services/marketplace/delivery/report-failed-attempt.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireDelivererId } from "../../../shared/require-deliverer";
import { reportFailedAttempt as reportFailedAttemptAction } from "@/services/marketplace/delivery/report-failed-attempt";

export async function reportFailedAttempt(deliveryItemId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const delivererId = await requireDelivererId();
    const body = await readJsonBody<{ reason?: string }>(request);

    const result = await reportFailedAttemptAction(delivererId, deliveryItemId, body.reason ?? "");
    return NextResponse.json({
      message: result.secondFailure ? "Item cancelled after second failed attempt." : "Delivery attempt marked as failed; retry scheduled.",
    });
  });
}
