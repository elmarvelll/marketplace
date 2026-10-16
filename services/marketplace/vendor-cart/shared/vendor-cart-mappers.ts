// services/marketplace/vendor-cart/shared/vendor-cart-mappers.ts
//
// Prisma select shape + row-to-DTO mapper for the Vendor cart — the
// School-Vendor-scoped counterpart of
// services/marketplace/cart/shared/cart-mappers.ts. A row here is either a
// Product(+variant) line or a Side line (see CartItem.sideId in
// prisma/schema.prisma) — never both, enforced by add-to-vendor-cart.ts.

import type { Prisma } from "@prisma/client";
import type { VendorCartLineItem } from "@/types/vendor-cart";

export const vendorCartItemSelect = {
  id: true,
  quantity: true,
  variantId: true,
  product: {
    select: {
      id: true,
      name: true,
      price: true,
      stock: true,
      secure_url: true,
      businessId: true,
      serviceFeeExempt: true,
      business: { select: { name: true } },
    },
  },
  side: {
    select: { id: true, name: true, price: true, stock: true, businessId: true, serviceFeeExempt: true, business: { select: { name: true } } },
  },
  variant: {
    select: { price: true, stock: true, variantValues: { select: { value: { select: { value: true } } } } },
  },
} satisfies Prisma.CartItemSelect;

type VendorCartItemRow = Prisma.CartItemGetPayload<{ select: typeof vendorCartItemSelect }>;

export function toVendorCartLineItem(row: VendorCartItemRow): VendorCartLineItem {
  if (row.side) {
    return {
      id: row.id,
      kind: "side",
      businessId: row.side.businessId,
      vendorName: row.side.business.name,
      productId: null,
      variantId: null,
      sideId: row.side.id,
      name: row.side.name,
      variantName: null,
      price: row.side.price,
      quantity: row.quantity,
      stock: row.side.stock,
      image: null,
      serviceFeeExempt: row.side.serviceFeeExempt,
    };
  }

  // Not a side line — must be a product line (add-to-vendor-cart.ts
  // guarantees exactly one is set).
  const product = row.product!;
  const variantName = row.variant?.variantValues[0]?.value.value ?? null;

  return {
    id: row.id,
    kind: "product",
    businessId: product.businessId,
    vendorName: product.business.name,
    productId: product.id,
    variantId: row.variantId,
    sideId: null,
    name: product.name,
    variantName,
    price: row.variant?.price ?? product.price,
    quantity: row.quantity,
    stock: row.variant?.stock ?? product.stock,
    image: product.secure_url,
    serviceFeeExempt: product.serviceFeeExempt,
  };
}
