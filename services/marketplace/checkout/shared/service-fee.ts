// services/marketplace/checkout/shared/service-fee.ts
//
// The platform's cut, as a fraction of an item's gross price — used both
// as an additive buyer-facing fee at checkout (get-checkout-summary.ts,
// create-orders-for-checkout.ts) and as the deduction applied to a
// seller's payout (services/marketplace/escrow/{calculate-item-payout,refund-order-item,mark-item-eligible-for-payout}.ts). Flat
// zero for now, kept as a named constant since it's expected to change —
// see docs/marketplace/decisions/flat-zero-service-fee.md.

export const SERVICE_FEE_RATE = 0;
