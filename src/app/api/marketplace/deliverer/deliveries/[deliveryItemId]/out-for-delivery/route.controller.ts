// .../deliveries/[deliveryItemId]/out-for-delivery/route.controller.ts
//
// Controller for POST .../out-for-delivery. See
// services/marketplace/delivery/mark-out-for-delivery.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireDelivererId } from "../../../shared/require-deliverer";
import { markOutForDelivery as markOutForDeliveryAction } from "@/services/marketplace/delivery/mark-out-for-delivery";

export async function markOutForDelivery(deliveryItemId: string): Promise<NextResponse> {
  return runController(async () => {
    const delivererId = await requireDelivererId();
    await markOutForDeliveryAction(delivererId, deliveryItemId);
    return NextResponse.json({ message: "Marked out for delivery." });
  });
}
