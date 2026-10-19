// src/app/api/marketplace/admin/delivery-roster/slots/route.ts
//
// GET ?operation= -> every slot of that roster (inactive included).
// POST            -> creates a central (Marketplace) delivery slot.

import { NextRequest } from "next/server";
import { getSlots, postCentralSlot } from "../route.controller";

export async function GET(request: NextRequest) {
  return getSlots(request);
}

export async function POST(request: NextRequest) {
  return postCentralSlot(request);
}
