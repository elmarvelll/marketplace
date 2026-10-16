// services/marketplace/cart/get-cart-for-user.ts
//
// The signed-in user's cart — read by every cart action that needs the
// current lines, and by src/app/api/marketplace/cart/route.controller.ts's
// GET handler and services/marketplace/checkout/get-checkout-summary.ts /
// create-orders-for-checkout.ts.

import { prisma } from "@/lib/prisma";
import type { CartLineItem } from "@/types/cart";
import { cartItemSelect, toCartLineItem } from "./shared/cart-mappers";

export async function getCartForUser(userId: string): Promise<CartLineItem[]> {
  const items = await prisma.cartItem.findMany({
    // productId is now optional on CartItem so School Vendor "Side" lines
    // (sideId set, productId null — see prisma/schema.prisma) can share
    // the table; this Business cart reader must exclude them, both because
    // this mapper doesn't know how to render a Side line and because
    // Business/Vendor carts are deliberately separate experiences (see
    // services/marketplace/vendor-cart/ for the Vendor equivalent).
    // Belt-and-braces alongside add-to-cart.ts's own guard: even if a
    // vendor-product CartItem row ever existed, it's excluded here too.
    where: { userId, productId: { not: null }, product: { business: { type: "BUSINESS" } } },
    select: cartItemSelect,
    orderBy: { createdAt: "desc" },
  });
  return items.map(toCartLineItem);
}
