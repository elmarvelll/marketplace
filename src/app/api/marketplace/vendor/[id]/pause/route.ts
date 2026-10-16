// .../vendor/[id]/pause/route.ts
//
// POST   -> vendor owner pauses (temporarily unavailable for new orders).
// DELETE -> vendor owner unpauses.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { pauseVendorHandler, unpauseVendorHandler } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return pauseVendorHandler(request, id);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return unpauseVendorHandler(id);
}
