// src/types/product.ts
//
// Shared shapes for the business dashboard's Products tab
// (src/app/business/[id]/products/) and the
// /api/marketplace/businesses/[id]/products[...] routes.

// A flat, selectable variant: one name, one price, one stock count — e.g.
// { name: "Small", price: 2000, stock: 10 }. Persisted as one implicit
// VariantField + one VariantValue + one ProductVariant (with its own
// price/stock) per row, joined via VariantValueOnProductVariant — see
// services/marketplace/product/shared/product-variants.ts. Deliberately
// NOT a multi-attribute matrix (no Size x Color combinations) — every
// variant is independently named and priced.
export interface ProductVariantRow {
  // Present once persisted; absent for a row the seller just added in the
  // form and hasn't saved yet.
  id?: string;
  name: string;
  // Kept as strings here, same as the base price/stock fields below —
  // bound to <input type="number"> controlled inputs.
  price: string;
  stock: string;
}

export interface ProductVariantSummary {
  id: string;
  name: string;
  price: number;
  stock: number;
}

// One product image, for the multi-image gallery — see
// services/marketplace/product/shared/product-images.ts. `position` 0 is
// the primary image (mirrored onto Product.image/public_id/secure_url so
// every single-image consumer keeps working unchanged).
export interface ProductImageRow {
  id?: string;
  publicId: string;
  secureUrl: string;
  position: number;
}

// Numeric fields are kept as strings here since they're bound to
// <input type="number"> controlled inputs; parsed to numbers only when
// building the request body.
export interface ProductFormValues {
  name: string;
  category: string;
  description: string;
  price: string;
  cost: string;
  stock: string;
  publicId?: string;
  secureUrl?: string;
  images: ProductImageRow[];
  variants: ProductVariantRow[];
}

export interface ProductSummary {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  secureUrl: string | null;
  images: ProductImageRow[];
  variants: ProductVariantSummary[];
}

export interface ProductDetail extends ProductSummary {
  description: string;
  publicId: string | null;
}
