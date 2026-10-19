// src/app/api/marketplace/admin/delivery-roster/plans/route.ts
//
// PUT { scheduledDeliveryId | bookingId, delivererId | null } -> an admin sets one delivery's planned deliverer.

import { NextRequest } from "next/server";
import { putPlan } from "../route.controller";

export async function PUT(request: NextRequest) {
  return putPlan(request);
}
