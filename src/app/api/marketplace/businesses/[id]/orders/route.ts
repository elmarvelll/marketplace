// src/app/api/marketplace/businesses/[id]/orders/route.ts
//
// GET -> this business's orders, split into the five seller dashboard
// sections. Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { listOrders } from "./route.controller";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return listOrders(id);
}
