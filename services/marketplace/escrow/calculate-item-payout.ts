// services/marketplace/escrow/calculate-item-payout.ts
//
// Net payout for one order item: historical price snapshot x quantity,
// minus the platform's service fee. Deliberately takes the already-loaded
// price/quantity rather than re-fetching the product, so a caller can
// never accidentally pass in a live (non-historical) price — see
// docs/marketplace/data/price-snapshots.md. Called by
// services/marketplace/payout/process-item-payout.ts.

import { SERVICE_FEE_RATE } from "@/services/marketplace/checkout/shared/service-fee";

export function calculateItemPayout(price: number, quantity: number): { gross: number; fee: number; net: number } {
  const gross = price * quantity;
  const fee = gross * SERVICE_FEE_RATE;
  return { gross, fee, net: gross - fee };
}
