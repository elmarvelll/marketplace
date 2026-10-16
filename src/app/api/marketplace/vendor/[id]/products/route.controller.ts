// .../vendor/[id]/products/route.controller.ts
//
// Controller for GET/POST .../vendor/[id]/products — the vendor's own
// product API, separate from Business's .../businesses/[id]/products
// (spec §14: Vendor gets its own dedicated API handling). See
// services/marketplace/vendor/product/vendor-product.service.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { listVendorProducts, createVendorProduct } from "@/services/marketplace/vendor/product/vendor-product.service";
import type { ProductFormValues } from "@/types/product";

export async function listProducts(businessId: string): Promise<NextResponse> {
  return runController(async () => {
    const products = await listVendorProducts(businessId);
    return NextResponse.json({ products });
  });
}

export async function createProduct(businessId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const body = await readJsonBody<Partial<ProductFormValues>>(request);
    const product = await createVendorProduct(businessId, body);
    return NextResponse.json({ message: "Product created.", product }, { status: 201 });
  });
}
