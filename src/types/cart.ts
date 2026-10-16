// src/types/cart.ts
//
// Shared shape for the real cart (Prisma `CartItem`, replacing the old
// services/marketplace/shared/cart.ts mock), used by
// GET/POST /api/marketplace/cart, PATCH/DELETE .../cart/[itemId], and the
// _components/useCart.ts hook that both CartDrawer and the checkout page
// read from.

export interface CartLineItem {
  id: string;
  productId: string;
  businessId: string;
  productName: string;
  sellerName: string;
  // The selected variant's price/stock when variantId is set, else the
  // product's own price/stock — see
  // services/marketplace/cart/shared/cart-mappers.ts#toCartLineItem.
  price: number;
  quantity: number;
  stock: number;
  image: string | null;
  selectedVariants: Record<string, string> | null;
  variantId: string | null;
  variantName: string | null;
}
