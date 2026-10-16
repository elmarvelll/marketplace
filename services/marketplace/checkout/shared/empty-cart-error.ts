// services/marketplace/checkout/shared/empty-cart-error.ts
//
// Thrown by create-orders-for-checkout.ts when the buyer's cart is empty —
// kept as its own error type (rather than a generic ServiceError) since
// the controller needs to distinguish "empty cart" from any other
// unexpected failure at checkout time.

export class EmptyCartError extends Error {}
