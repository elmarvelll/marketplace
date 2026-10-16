// src/app/api/marketplace/businesses/[id]/report/route.ts
//
// POST { reason } -> buyer reports a business. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { report } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return report(id, request);
}
