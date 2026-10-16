// src/app/api/webhooks/paystack/route.controller.ts
//
// Controller for POST /api/webhooks/paystack. See
// services/marketplace/payment/{is-valid-paystack-signature,handle-paystack-event}.ts.
//
// Responses: 401 bad/missing signature · 400 unparseable body · 200 handled
// or ignored · 503 when the payment's state couldn't be established (Paystack
// verify unreachable) and 500 on our own failure — both non-2xx on purpose,
// so Paystack retries the delivery. Processing is idempotent per reference,
// so retries and duplicate deliveries are safe.

import { NextRequest, NextResponse } from "next/server";
import { isValidPaystackSignature } from "@/services/marketplace/payment/is-valid-paystack-signature";
import { handlePaystackEvent } from "@/services/marketplace/payment/handle-paystack-event";
import { scheduleCheckoutBackgroundWork } from "@/lib/schedule-checkout-background";
import { logPayment } from "@/services/marketplace/checkout/shared/payment-log";

export async function handleWebhook(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  let signatureOk = false;
  try {
    signatureOk = isValidPaystackSignature(rawBody, request.headers.get("x-paystack-signature"));
  } catch (err) {
    // Secret key not configured — fail loudly (500) rather than as a 401,
    // so the misconfiguration is visible and Paystack keeps retrying.
    logPayment("error", "webhook_misconfigured", { message: err instanceof Error ? err.message : "unknown" });
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 500 });
  }
  if (!signatureOk) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: Parameters<typeof handlePaystackEvent>[0];
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  try {
    const outcome = await handlePaystackEvent(event);
    scheduleCheckoutBackgroundWork({ emailIds: outcome.emailIds });
    if (outcome.retry) {
      return NextResponse.json({ received: true, processed: false }, { status: 503 });
    }
  } catch (err) {
    logPayment("error", "webhook_failed", { message: err instanceof Error ? err.message : "unknown" });
    console.error(err);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  // Paystack just wants a 2xx to know the webhook was received.
  return NextResponse.json({ received: true });
}
