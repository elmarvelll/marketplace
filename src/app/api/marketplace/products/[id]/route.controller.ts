// src/app/api/marketplace/products/[id]/route.controller.ts
//
// Controller for GET /api/marketplace/products/[id]. See
// services/marketplace/product/get-public-product-detail.ts.

import { NextResponse } from "next/server";
import { runController, requireSessionUserId } from "@/lib/controller-helpers";
import { getPublicProductDetail } from "@/services/marketplace/product/get-public-product-detail";

export async function getPublicProduct(productId: string): Promise<NextResponse> {
  return runController(async () => {
    await requireSessionUserId();
    const product = await getPublicProductDetail(productId);
    return NextResponse.json({ product });
  });
}
