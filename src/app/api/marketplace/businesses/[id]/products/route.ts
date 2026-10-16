// src/app/api/marketplace/businesses/[id]/products/route.ts
//
// GET  -> this business's product listing.
// POST -> creates a product.
//
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { listProducts, createProduct } from "./route.controller";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return listProducts(id);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return createProduct(id, request);
}
