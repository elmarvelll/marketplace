// services/marketplace/checkout/shared/checkout-payment-config.ts
//
// How long an initialized-but-unpaid checkout may hold its stock (and, for
// vendors, delivery capacity). Long enough for a card/OTP/bank-transfer
// popup, short enough that an abandoned checkout doesn't lock the last unit
// of a product for long. After this, the reconciler verifies with Paystack
// and releases the reservation unless the payment actually succeeded.
export const RESERVATION_TTL_MINUTES = 30;

// A Paystack transaction still "pending" (e.g. an unsettled bank transfer)
// is left reserved past the TTL until this hard limit, then released; a
// success that lands even later is still reconciled (re-reserved, or flagged
// for review if the stock is gone).
export const PENDING_PROVIDER_MAX_HOURS = 24;

export function reservationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + RESERVATION_TTL_MINUTES * 60 * 1000);
}

// Vendor capacity counts a still-unpaid order only while its reservation is
// live — see countVendorBookingsForSlot.
export function liveReservationCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - RESERVATION_TTL_MINUTES * 60 * 1000);
}

export const CHECKOUT_CURRENCY = "NGN";

export function toKobo(naira: number): number {
  return Math.round(naira * 100);
}
