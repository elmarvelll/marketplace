// .../admin/disputes/[orderId]/resolve/route.ts
//
// POST { resolution } -> admin resolves a disputed order. Thin route —
// see ./route.controller.ts.

import { NextRequest } from "next/server";
import { resolve } from "./route.controller";

export async function POST(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return resolve(orderId, request);
}
