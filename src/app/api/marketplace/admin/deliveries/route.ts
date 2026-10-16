// src/app/api/marketplace/admin/deliveries/route.ts
//
// POST { delivererId, orderItemIds } -> the delivery coordinator assigns a
// batch of dropped-off order items to one deliverer. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { assignDelivery } from "./route.controller";

export async function POST(request: NextRequest) {
  return assignDelivery(request);
}
