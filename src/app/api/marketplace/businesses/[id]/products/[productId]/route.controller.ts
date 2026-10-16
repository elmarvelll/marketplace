// .../businesses/[id]/products/[productId]/route.controller.ts
//
// Controller for GET/PATCH/DELETE .../businesses/[id]/products/[productId].
// See services/marketplace/product/{get-owned-product-detail,update-product,delete-product}.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireOwnedBusinessOnly } from "@/services/marketplace/business/business-ownership.service";
import { getOwnedProductDetail } from "@/services/marketplace/product/get-owned-product-detail";
import { updateProduct as updateProductAction } from "@/services/marketplace/product/update-product";
import { deleteProduct as deleteProductAction } from "@/services/marketplace/product/delete-product";
import type { ProductFormValues } from "@/types/product";

export async function getProduct(businessId: string, productId: string): Promise<NextResponse> {
  return runController(async () => {
    const owned = await requireOwnedBusinessOnly(businessId);
    const product = await getOwnedProductDetail(owned.businessId, productId);
    return NextResponse.json({ product });
  });
}

export async function updateProduct(businessId: string, productId: string, request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    const owned = await requireOwnedBusinessOnly(businessId);
    const body = await readJsonBody<Partial<ProductFormValues>>(request);
    const product = await updateProductAction(owned.businessId, productId, body);
    return NextResponse.json({ message: "Product updated.", product });
  });
}

export async function deleteProduct(businessId: string, productId: string): Promise<NextResponse> {
  return runController(async () => {
    const owned = await requireOwnedBusinessOnly(businessId);
    await deleteProductAction(owned.businessId, productId);
    return NextResponse.json({ message: "Product deleted." });
  });
}
