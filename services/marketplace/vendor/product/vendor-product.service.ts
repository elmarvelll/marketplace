// services/marketplace/vendor/product/vendor-product.service.ts
//
// Vendor-owned product/variant/image management — its own service layer
// and (via the routes that call it) its own API routes, per
// docs/marketplace/decisions/vendor-independent-architecture.md, rather
// than living inside Business's product API handlers.
//
// The actual field-parsing/variant/image logic is NOT duplicated here:
// services/marketplace/product/{create,update,delete,get-owned-product-detail,list-business-products}.ts
// are already generic — they take a businessId and operate on
// Product/ProductVariant/ProductImage with no Business-specific branching
// at all (confirmed by inspection: neither file imports or references
// anything Business-owned). This layer's only job is the vendor
// ownership+type guard (requireOwnedVendor) before delegating to them —
// "genuinely shared functionality," not a parallel reimplementation.

import type { ProductFormValues } from "@/types/product";
import { requireOwnedVendor } from "@/services/marketplace/vendor/shared/require-owned-vendor";
import { listBusinessProducts } from "@/services/marketplace/product/list-business-products";
import { createProduct } from "@/services/marketplace/product/create-product";
import { updateProduct } from "@/services/marketplace/product/update-product";
import { deleteProduct } from "@/services/marketplace/product/delete-product";
import { getOwnedProductDetail } from "@/services/marketplace/product/get-owned-product-detail";

export async function listVendorProducts(businessId: string) {
  await requireOwnedVendor(businessId);
  return listBusinessProducts(businessId);
}

export async function getVendorProductDetail(businessId: string, productId: string) {
  await requireOwnedVendor(businessId);
  return getOwnedProductDetail(businessId, productId);
}

export async function createVendorProduct(businessId: string, body: Partial<ProductFormValues>) {
  await requireOwnedVendor(businessId);
  return createProduct(businessId, body);
}

export async function updateVendorProduct(businessId: string, productId: string, body: Partial<ProductFormValues>) {
  await requireOwnedVendor(businessId);
  return updateProduct(businessId, productId, body);
}

export async function deleteVendorProduct(businessId: string, productId: string) {
  await requireOwnedVendor(businessId);
  return deleteProduct(businessId, productId);
}
