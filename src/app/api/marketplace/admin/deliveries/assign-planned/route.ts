// src/app/api/marketplace/admin/deliveries/assign-planned/route.ts
//
// POST { orderItemIds } -> assigns each ready item to its planned deliverer (through assign-delivery.ts).
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { assignPlanned } from "./route.controller";

export async function POST(request: NextRequest) {
  return assignPlanned(request);
}
