// services/marketplace/fines/shared/constants.ts
//
// No fine amount is specified anywhere in the product spec — this is a
// placeholder flat amount (₦2,000) kept as a named constant specifically
// so it's a one-line change once a real amount is decided, same
// convention as SERVICE_FEE_RATE. See
// docs/marketplace/decisions/flat-zero-service-fee.md for the precedent.

export const LATE_DELIVERY_FINE_AMOUNT = 2000;
