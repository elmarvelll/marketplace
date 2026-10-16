// src/app/api/marketplace/businesses/[id]/products/route.controller.ts
//
// Controller for GET/POST .../businesses/[id]/products. See
// services/marketplace/product/{list-business-products,create-product}.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireOwnedBusinessOnly } from "@/services/marketplace/business/business-ownership.service";
import { listBusinessProducts } from "@/services/marketplace/product/list-business-products";
import { createProduct as createProductAction } from "@/services/marketplace/product/create-product";
import type { ProductFormValues } from "@/types/product";

export async function listProducts(businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const owned = await requireOwnedBusinessOnly(businessId);
    const products = await listBusinessProducts(owned.businessId);
    return NextResponse.json({ products });
  });
}

export async function createProduct(businessId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const owned = await requireOwnedBusinessOnly(businessId);
    const body = await readJsonBody<Partial<ProductFormValues>>(request);
    const product = await createProductAction(owned.businessId, body);
    return NextResponse.json({ message: "Product created.", product }, { status: 201 });
  });
}
