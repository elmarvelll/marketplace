// .../orders/[id]/dispute/route.ts
//
// POST { reason } -> buyer disputes their own order. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { dispute } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return dispute(id, request);
}
