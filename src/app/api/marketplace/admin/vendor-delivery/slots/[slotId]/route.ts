// .../admin/vendor-delivery/slots/[slotId]/route.ts
//
// PATCH -> updates a delivery slot's capacity/cutoff/prep-deadline/active
// state. Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { updateSlot } from "./route.controller";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slotId: string }> }) {
  const { slotId } = await params;
  return updateSlot(request, slotId);
}
