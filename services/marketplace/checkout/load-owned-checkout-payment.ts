// services/marketplace/checkout/load-owned-checkout-payment.ts
//
// A buyer may only verify or cancel THEIR OWN checkout. Not-found (never
// forbidden) for anyone else's reference, so a reference can't be probed —
// same convention as business-ownership.service.ts.

import type { CheckoutPayment } from "@prisma/client";
import { notFound } from "@/lib/service-error";
import { ensureCheckoutPayment } from "./ensure-checkout-payment";

export async function loadOwnedCheckoutPayment(reference: string, userId: string): Promise<CheckoutPayment> {
  const payment = await ensureCheckoutPayment(reference);
  if (!payment || payment.userId !== userId) throw notFound("We couldn't find that checkout.");
  return payment;
}
