// src/app/api/marketplace/admin/products/route.controller.ts
//
// Controller for GET /api/marketplace/admin/products. See
// services/marketplace/admin/list-products-for-admin.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { listProductsForAdmin } from "@/services/marketplace/admin/list-products-for-admin";

export async function listProducts(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    await requireAdmin();
    const result = await listProductsForAdmin(request.nextUrl.searchParams);
    return NextResponse.json(result);
  });
}
