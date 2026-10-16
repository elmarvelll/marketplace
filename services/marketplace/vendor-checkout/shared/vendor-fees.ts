// services/marketplace/vendor-checkout/shared/vendor-fees.ts
//
// The authoritative, backend fee calculation for a Vendor cart — deliberately
// separate from services/marketplace/checkout/shared/service-fee.ts's
// Business-only SERVICE_FEE_RATE (a percentage), since the vendor spec's
// fee shape is flat-per-distinct-item, not percentage-of-gross (see
// docs/marketplace/decisions/vendor-extends-business.md). Used by both the
// checkout-summary preview and the authoritative booking transaction, so
// the number shown to a buyer and the number actually charged can never
// drift apart.

import type { VendorCartLineItem } from "@/types/vendor-cart";

export interface VendorFeeBreakdown {
  subtotal: number;
  chargeableItemCount: number;
  serviceFee: number;
  deliveryFee: number;
  total: number;
}

export function calculateVendorFees(
  items: VendorCartLineItem[],
  fees: { vendorServiceFeeAmount: number; vendorDeliveryFee: number }
): VendorFeeBreakdown {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // "Distinct chargeable main product/item" — a Side never counts (spec
  // §19: sides don't generate a service fee), a serviceFeeExempt product
  // never counts, and multiple variant lines of the SAME product still
  // count once, since they share productId. Quantity never multiplies it.
  const chargeableProductIds = new Set(
    items.filter((item) => item.kind === "product" && !item.serviceFeeExempt && item.productId).map((item) => item.productId)
  );
  const chargeableItemCount = chargeableProductIds.size;

  const serviceFee = chargeableItemCount * fees.vendorServiceFeeAmount;
  const deliveryFee = items.length > 0 ? fees.vendorDeliveryFee : 0;

  return { subtotal, chargeableItemCount, serviceFee, deliveryFee, total: subtotal + serviceFee + deliveryFee };
}
