// .../deliveries/[deliveryItemId]/deliver/route.controller.ts
//
// Controller for POST .../deliver. See
// services/marketplace/delivery/confirm-delivery.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { badRequest } from "@/lib/service-error";
import { requireDelivererId } from "../../../shared/require-deliverer";
import { confirmDelivery as confirmDeliveryAction } from "@/services/marketplace/delivery/confirm-delivery";

export async function confirmDelivery(deliveryItemId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const delivererId = await requireDelivererId();
    const body = await readJsonBody<{ otp?: string }>(request);
    const otp = body.otp?.trim();
    if (!otp) throw badRequest("otp is required.");

    await confirmDeliveryAction(delivererId, deliveryItemId, otp);
    return NextResponse.json({ message: "Delivery confirmed." });
  });
}
