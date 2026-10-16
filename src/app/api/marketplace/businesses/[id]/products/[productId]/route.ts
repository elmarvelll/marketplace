// src/app/api/marketplace/businesses/[id]/products/[productId]/route.ts
//
// GET    -> one product's full detail.
// PATCH  -> saves the edit form.
// DELETE -> removes the product.
//
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { getProduct, updateProduct, deleteProduct } from "./route.controller";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id, productId } = await params;
  return getProduct(id, productId);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id, productId } = await params;
  return updateProduct(id, productId, request);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id, productId } = await params;
  return deleteProduct(id, productId);
}
