// src/app/api/marketplace/products/[id]/route.ts
//
// GET -> one product's public detail. Thin route — see
// ./route.controller.ts.

import { NextRequest } from "next/server";
import { getPublicProduct } from "./route.controller";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return getPublicProduct(id);
}
