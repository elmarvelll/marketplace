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
import { findCentralSlot } from "@/services/marketplace/delivery-roster/central-scheduling";
import { formatSlotDate } from "@/services/marketplace/delivery-roster/shared/roster-calendar";

// "17:30" -> "5:30 PM" (slot windows are school-timezone wall-clock times).
function formatClock(hhmm: string): string {
  const [hour, minute] = hhmm.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

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
  // With central delivery slots configured, the estimate is the slot
  // occurrence checkout will most likely book (central-scheduling.ts — the
  // same search, without its lock); checkout/initialize re-runs it as the
  // authoritative step. Without central slots: the existing estimate.
  const estimatesByBusiness = new Map(
    await Promise.all(
      businessIds.map(async (businessId) => {
        const central = await findCentralSlot(businessId);
        if (central === "full") return [businessId, { date: "No delivery slot available", window: "Central delivery is fully booked — try again later" }] as const;
        if (central) {
          return [businessId, { date: formatSlotDate(central.date), window: `${formatClock(central.slot.windowStart)} - ${formatClock(central.slot.windowEnd)}` }] as const;
        }
        return [businessId, formatEstimatedDelivery(await getEstimatedDeliveryForBusiness(businessId))] as const;
      })
    )
  );

  return {
    items: cartItems.map((item) => {
      const { date, window } = estimatesByBusiness.get(item.businessId)!;
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
