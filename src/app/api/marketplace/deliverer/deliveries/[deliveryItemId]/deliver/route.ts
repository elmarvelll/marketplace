// .../deliverer/deliveries/[deliveryItemId]/deliver/route.ts
//
// POST { otp } -> deliverer confirms delivery. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { confirmDelivery } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ deliveryItemId: string }> }) {
  const { deliveryItemId } = await params;
  return confirmDelivery(deliveryItemId, request);
}
