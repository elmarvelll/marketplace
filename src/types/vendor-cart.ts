// src/types/vendor-cart.ts
//
// Shared shape for the Vendor cart (Prisma CartItem rows with sideId set,
// or productId set on a School Vendor's product) — kept as its own type
// from CartLineItem (src/types/cart.ts) even though both read the same
// table, since a vendor line can be a Side (no product at all) and the
// Business cart deliberately never sees vendor lines (see
// docs/marketplace/decisions/vendor-extends-business.md).

export interface VendorCartLineItem {
  id: string;
  kind: "product" | "side";
  businessId: string;
  vendorName: string;
  // productId/variantId only set for kind: "product"; sideId only for
  // kind: "side".
  productId: string | null;
  variantId: string | null;
  sideId: string | null;
  name: string;
  variantName: string | null;
  price: number;
  quantity: number;
  stock: number | null;
  image: string | null;
  // Data-driven service-fee exemption (spec: never hardcode "Fries" —
  // see services/marketplace/vendor-checkout/calculate-vendor-checkout-summary.ts).
  serviceFeeExempt: boolean;
}
