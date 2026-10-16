// .../vendor/[id]/sides/[sideId]/route.ts
//
// PATCH  -> updates a side.
// DELETE -> deletes a side.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { updateSideHandler, deleteSideHandler } from "./route.controller";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; sideId: string }> }) {
  const { id, sideId } = await params;
  return updateSideHandler(request, id, sideId);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; sideId: string }> }) {
  const { id, sideId } = await params;
  return deleteSideHandler(id, sideId);
}
