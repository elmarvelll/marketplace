// .../admin/products/[productId]/route.ts
//
// GET -> one product's full detail for the admin Product Detail page.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { getProduct } from "./route.controller";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return getProduct(productId);
}
