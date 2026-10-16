// services/marketplace/vendor-cart/get-vendor-cart-for-user.ts
//
// The signed-in user's Vendor cart — every CartItem row that's a Side, or
// a Product belonging to a School Vendor business. Called by
// src/app/api/marketplace/vendor-cart/route.controller.ts and
// services/marketplace/vendor-checkout/*.

import { prisma } from "@/lib/prisma";
import type { VendorCartLineItem } from "@/types/vendor-cart";
import { vendorCartItemSelect, toVendorCartLineItem } from "./shared/vendor-cart-mappers";

export async function getVendorCartForUser(userId: string): Promise<VendorCartLineItem[]> {
  const items = await prisma.cartItem.findMany({
    where: {
      userId,
      OR: [{ sideId: { not: null } }, { product: { business: { type: "SCHOOL_VENDOR" } } }],
    },
    select: vendorCartItemSelect,
    orderBy: { createdAt: "desc" },
  });
  return items.map(toVendorCartLineItem);
}
