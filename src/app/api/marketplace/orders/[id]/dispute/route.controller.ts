// .../orders/[id]/dispute/route.controller.ts
//
// Controller for POST .../orders/[id]/dispute — buyer-owned-order only.
// See services/marketplace/order/dispute-order.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody, requireSessionUserId } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { disputeOrder } from "@/services/marketplace/order/dispute-order";

export async function dispute(orderId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const userId = await requireSessionUserId();
    const body = await readJsonBody<{ reason?: string }>(request);
    if (!body.reason?.trim()) throw badRequest("A reason is required.");
    await disputeOrder(orderId, userId, body.reason.trim());
    return NextResponse.json({ message: "Dispute submitted." });
  });
}
