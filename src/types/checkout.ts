// src/types/checkout.ts
//
// Frontend-facing shapes for the checkout page, mirroring
// services/marketplace/checkout/{get-checkout-summary,create-orders-for-checkout,confirm-payment-by-reference}.ts's CheckoutSummary (kept as a separate file,
// same convention as every other src/types/*.ts, rather than importing
// from a server-only lib module).

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

export interface InitializeCheckoutResponse {
  reference: string;
  amountKobo: number;
  email: string;
  // Added with the payment-attempt lifecycle; optional so an older cached
  // client bundle talking to a newer server (or vice versa) keeps working.
  currency?: string;
  // Paystack publishable key for the mode (test/live) the server verifies in.
  publicKey?: string | null;
}
