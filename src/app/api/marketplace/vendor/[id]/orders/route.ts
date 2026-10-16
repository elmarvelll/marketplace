// .../vendor/[id]/orders/route.ts
//
// GET -> this vendor's own orders + any pending pickup codes. Thin route
// — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { getOrders } from "./route.controller";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return getOrders(id);
}
