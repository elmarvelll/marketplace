// .../vendor/[id]/capacity/route.ts
//
// GET -> this vendor's per-slot capacity + booked count for an optional
//        ?date= (defaults to today).
// PUT  -> sets capacity for one slot, optionally scoped to a specific
//         date (spec §7 — omit `date` to set the default/recurring value).
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { deleteCapacityOverride, getCapacity, putCapacity } from "./route.controller";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return getCapacity(request, id);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return putCapacity(request, id);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return deleteCapacityOverride(request, id);
}
