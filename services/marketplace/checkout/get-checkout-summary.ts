// services/marketplace/checkout/get-checkout-summary.ts
//
// The checkout page's order preview: current cart lines, the buyer's saved
// location, subtotal, and the service fee. Read-only — doesn't create any
// Order rows. Called by
// src/app/api/marketplace/checkout/summary/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { getCartForUser } from "@/services/marketplace/cart/get-cart-for-user";
import { getEstimatedDeliveryForBusiness, formatEstimatedDelivery } from "@/services/marketplace/delivery/estimated-delivery.service";
import { SERVICE_FEE_RATE } from "./shared/service-fee";

export interface CheckoutSummaryItem {
  id: string;
  productName: string;
  sellerName: string;
  price: number;
  quantity: number;
  image: string | null;
  selectedVariants: Record<string, string> | null;
  variantName: string | null;
  estimatedDeliveryDate: string;
  deliveryWindow: string;
}

export interface CheckoutSummary {
  items: CheckoutSummaryItem[];
  location: string;
  subtotal: number;
  serviceFee: number;
  total: number;
}

export async function getCheckoutSummary(userId: string): Promise<CheckoutSummary> {
  const [cartItems, user] = await Promise.all([
    getCartForUser(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { location: true } }),
  ]);

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const serviceFee = subtotal * SERVICE_FEE_RATE;

  // One estimate per business represented in the cart (every line from
  // the same business shares that business's delivery days), computed
  // with the same reusable function checkout/initialize and the product
  // profile use.
  const businessIds = Array.from(new Set(cartItems.map((item) => item.businessId)));
  const estimatesByBusiness = new Map(
    await Promise.all(businessIds.map(async (businessId) => [businessId, await getEstimatedDeliveryForBusiness(businessId)] as const))
  );

  return {
    items: cartItems.map((item) => {
      const { date, window } = formatEstimatedDelivery(estimatesByBusiness.get(item.businessId)!);
      return {
        id: item.id,
        productName: item.productName,
        sellerName: item.sellerName,
        price: item.price,
        quantity: item.quantity,
        image: item.image,
        selectedVariants: item.selectedVariants,
        variantName: item.variantName,
        estimatedDeliveryDate: date,
        deliveryWindow: window,
      };
    }),
    location: user?.location ?? "",
    subtotal,
    serviceFee,
    total: subtotal + serviceFee,
  };
}
