// src/app/api/marketplace/search/products/route.controller.ts
//
// Controller for GET /api/marketplace/search/products. See
// services/marketplace/product/search-products.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, requireSessionUserId } from "@/lib/controller-helpers";
import { searchProducts as searchProductsAction } from "@/services/marketplace/product/search-products";

export async function searchProducts(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireSessionUserId();

    const q = request.nextUrl.searchParams.get("q") ?? undefined;
    const categoryIds = (request.nextUrl.searchParams.get("categories") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const limit = Number(request.nextUrl.searchParams.get("limit"));

    const products = await searchProductsAction({ q, categoryIds, limit: Number.isFinite(limit) ? limit : undefined });
    return NextResponse.json({ products });
  });
}
