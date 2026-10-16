// .../deliverer/deliveries/[deliveryItemId]/out-for-delivery/route.ts
//
// POST -> deliverer begins taking a picked-up item to the buyer. Thin
// route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { markOutForDelivery } from "./route.controller";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ deliveryItemId: string }> }) {
  const { deliveryItemId } = await params;
  return markOutForDelivery(deliveryItemId);
}
