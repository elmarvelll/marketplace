// .../deliverer/handoffs/[handoffId]/confirm-pickup/route.controller.ts
//
// Controller for POST .../confirm-pickup. See
// services/marketplace/delivery/confirm-pickup.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { requireDelivererId } from "../../../shared/require-deliverer";
import { confirmPickup as confirmPickupAction } from "@/services/marketplace/delivery/confirm-pickup";

export async function confirmPickup(handoffId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const delivererId = await requireDelivererId();
    const body = await readJsonBody<{ otp?: string }>(request);
    const otp = body.otp?.trim();
    if (!otp) throw badRequest("otp is required.");

    const result = await confirmPickupAction(delivererId, handoffId, otp);
    return NextResponse.json({ message: "Pickup confirmed.", ...result });
  });
}
