// .../vendor/[id]/products/[productId]/route.controller.ts
//
// Controller for GET/PATCH/DELETE .../vendor/[id]/products/[productId].
// See services/marketplace/vendor/product/vendor-product.service.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { getVendorProductDetail, updateVendorProduct, deleteVendorProduct } from "@/services/marketplace/vendor/product/vendor-product.service";
import type { ProductFormValues } from "@/types/product";

export async function getProduct(businessId: string, productId: string): Promise<NextResponse> {
  return runController(async () => {
    const product = await getVendorProductDetail(businessId, productId);
    return NextResponse.json({ product });
  });
}

export async function updateProduct(businessId: string, productId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const body = await readJsonBody<Partial<ProductFormValues>>(request);
    const product = await updateVendorProduct(businessId, productId, body);
    return NextResponse.json({ message: "Product updated.", product });
  });
}

export async function deleteProduct(businessId: string, productId: string): Promise<NextResponse> {
  return runController(async () => {
    await deleteVendorProduct(businessId, productId);
    return NextResponse.json({ message: "Product deleted." });
  });
}
