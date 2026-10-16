// services/marketplace/payment/handle-paystack-event.ts
//
// Routes a (signature-verified) Paystack webhook event to the right
// confirmation action. Called by
// src/app/api/webhooks/paystack/route.controller.ts.
//
// The event body is only a hint that something changed for a reference: the
// actual decision always comes from a server-side verify call against
// Paystack (inside reconcileCheckoutPayment / verifyFinePaymentByReference),
// which also checks amount and currency. Repeated deliveries of the same
// event are harmless — finalization is idempotent per reference.
//
// Returns `retry: true` when the outcome couldn't be established (Paystack
// verify unreachable); the controller then answers non-2xx so Paystack
// redelivers the webhook later instead of the payment being silently lost.

import { reconcileCheckoutPayment } from "@/services/marketplace/checkout/reconcile-checkout-payment";
import { verifyFinePaymentByReference } from "@/services/marketplace/fines/verify-fine-payment";
import { logPayment } from "@/services/marketplace/checkout/shared/payment-log";

export interface PaystackEventOutcome {
  handled: boolean;
  retry: boolean;
  emailIds: string[];
}

export async function handlePaystackEvent(event: { event?: unknown; data?: { reference?: unknown } | null }): Promise<PaystackEventOutcome> {
  if (event?.event !== "charge.success") return { handled: false, retry: false, emailIds: [] };

  const reference = typeof event.data?.reference === "string" ? event.data.reference.trim() : "";
  if (!reference) return { handled: false, retry: false, emailIds: [] };

  // Fine payments use a distinct "AKD-FINE-" reference prefix (see
  // initialize-fine-payment.ts) so this never has to guess which kind of
  // payment just succeeded — order checkout references never collide with
  // it.
  if (reference.startsWith("AKD-FINE-")) {
    const fine = await verifyFinePaymentByReference(reference);
    return { handled: fine.state === "paid", retry: fine.state === "unknown", emailIds: [] };
  }

  const result = await reconcileCheckoutPayment(reference, "webhook");
  logPayment("info", "webhook_processed", { reference, state: result.state });
  return {
    handled: result.state === "paid",
    retry: result.state === "unknown",
    emailIds: result.state === "paid" ? result.emailIds : [],
  };
}
