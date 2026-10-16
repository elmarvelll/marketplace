// services/marketplace/order/shared/paid-order.ts
//
// The one definition of "a real order". Checkout creates Order rows at
// initialize time with paymentStatus "pending" (they are the internal side
// of a CheckoutPayment attempt, holding its stock reservation); only once
// Paystack confirms payment do they become "paid". Every buyer/seller/vendor/
// admin listing, count, stat, and seller action filters on PAID_ORDER so an
// abandoned or failed checkout never shows up — or gets accepted, refunded,
// or counted as revenue — as if it were a real order. See
// docs/AKADVERSE_IMPLEMENTATION_CHANGELOG.md, section E.

export const ORDER_PAYMENT_STATUS = {
  // Checkout initialized, reservation held, payment not confirmed (internal).
  PENDING: "pending",
  // Paystack confirmed; this is a real customer order.
  PAID: "paid",
  // Released reservations — internal records kept for reconciliation only.
  FAILED: "failed",
  ABANDONED: "abandoned",
  EXPIRED: "expired",
  // Paid at Paystack but couldn't be finalized automatically (see CheckoutPayment.NEEDS_REVIEW).
  NEEDS_REVIEW: "needs_review",
} as const;

export const PAID_ORDER = { paymentStatus: ORDER_PAYMENT_STATUS.PAID } as const;
