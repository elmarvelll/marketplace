// src/app/api/marketplace/businesses/[id]/fines/route.ts
//
// GET -> this business's late-delivery fines + restriction state. Thin
// route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { listFines } from "./route.controller";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return listFines(id);
}
