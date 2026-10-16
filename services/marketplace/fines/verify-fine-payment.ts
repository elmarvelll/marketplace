// services/marketplace/fines/verify-fine-payment.ts
//
// Server-side verification for a late-delivery fine payment, shared by the
// seller's verify call and the webhook: asks Paystack about the reference and
// only confirms the fine when the transaction succeeded for the fine's exact
// amount in NGN. Same "never trust the browser / never trust the event body"
// rule as order checkout (services/marketplace/checkout/reconcile-checkout-payment.ts).

import { prisma } from "@/lib/prisma";
import { PaystackError, verifyTransaction } from "@/lib/external/paystack";
import { CHECKOUT_CURRENCY, toKobo } from "@/services/marketplace/checkout/shared/checkout-payment-config";
import { logPayment } from "@/services/marketplace/checkout/shared/payment-log";
import { confirmFinePaymentByReference } from "./confirm-fine-payment";

export type FineVerifyResult =
  | { state: "paid"; confirmedFineId: string | null }
  | { state: "not_paid"; providerStatus: string }
  | { state: "mismatch" }
  | { state: "unknown"; errorKind: string }
  | { state: "no_such_fine" };

export async function verifyFinePaymentByReference(reference: string, businessId?: string): Promise<FineVerifyResult> {
  const fine = await prisma.lateDeliveryFine.findFirst({
    where: { paystackReference: reference, ...(businessId ? { businessId } : {}) },
    select: { id: true, amount: true, status: true },
  });
  if (!fine) return { state: "no_such_fine" };
  if (fine.status === "PAID") return { state: "paid", confirmedFineId: null };

  let verified;
  try {
    verified = await verifyTransaction(reference);
  } catch (err) {
    if (!(err instanceof PaystackError)) throw err;
    logPayment("warn", "fine_verify_unavailable", { reference, errorKind: err.kind, httpStatus: err.httpStatus });
    return { state: "unknown", errorKind: err.kind };
  }
  if (verified.outcome !== "success") return { state: "not_paid", providerStatus: verified.status };

  if (verified.amountKobo !== toKobo(fine.amount) || verified.currency.toUpperCase() !== CHECKOUT_CURRENCY) {
    logPayment("error", "fine_payment_mismatch", { reference, expectedKobo: toKobo(fine.amount), paidKobo: verified.amountKobo, currency: verified.currency });
    return { state: "mismatch" };
  }

  const { confirmedFineId } = await confirmFinePaymentByReference(reference);
  return { state: "paid", confirmedFineId };
}
