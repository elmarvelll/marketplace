// services/marketplace/payment/is-valid-paystack-signature.ts
//
// Paystack webhook signature verification (HMAC-SHA512, constant-time
// compare). Called by
// src/app/api/webhooks/paystack/route.controller.ts. See
// docs/marketplace/security/payment-security.md.

import { createHmac, timingSafeEqual } from "crypto";
import { getPaystackSecretKey } from "@/lib/external/paystack";

export function isValidPaystackSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;

  const expected = createHmac("sha512", getPaystackSecretKey()).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");

  // timingSafeEqual throws if the buffers differ in length, which a
  // mismatched/garbage signature header often will.
  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
}
