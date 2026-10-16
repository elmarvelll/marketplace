// .../vendor/[id]/sides/route.ts
//
// GET  -> the vendor owner's sides.
// POST -> creates a new side.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { listSides, createSideHandler } from "./route.controller";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return listSides(id);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return createSideHandler(request, id);
}
