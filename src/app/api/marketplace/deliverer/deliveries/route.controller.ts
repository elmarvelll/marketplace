// src/app/api/marketplace/deliverer/deliveries/route.controller.ts
//
// Controller for GET /api/marketplace/deliverer/deliveries. See
// services/marketplace/delivery/list-assigned-delivery-items.ts.

import { NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireDelivererId } from "../shared/require-deliverer";
import { listAssignedDeliveryItems } from "@/services/marketplace/delivery/list-assigned-delivery-items";

export async function listDeliveries(): Promise<NextResponse> {
  return runController(async () => {
    const delivererId = await requireDelivererId();
    const items = await listAssignedDeliveryItems(delivererId);
    return NextResponse.json({ items });
  });
}
