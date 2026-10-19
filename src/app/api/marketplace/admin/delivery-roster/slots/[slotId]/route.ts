// src/app/api/marketplace/admin/delivery-roster/slots/[slotId]/route.ts
//
// PATCH -> edits a central (Marketplace) delivery slot (label, times, positions, active).

import { NextRequest } from "next/server";
import { patchCentralSlot } from "../../route.controller";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slotId: string }> }) {
  const { slotId } = await params;
  return patchCentralSlot(request, slotId);
}
