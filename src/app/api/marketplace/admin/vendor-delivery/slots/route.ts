// .../admin/vendor-delivery/slots/route.ts
//
// GET  -> every VendorDeliverySlot.
// POST -> creates a new slot.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { listSlots, createSlot } from "./route.controller";

export async function GET() {
  return listSlots();
}

export async function POST(request: NextRequest) {
  return createSlot(request);
}
