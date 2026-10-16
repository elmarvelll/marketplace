// src/app/checkout/_components/paystackCheckout.ts
//
// The browser half of paying for a checkout, shared by the Business and
// Vendor checkout pages so both behave identically:
//
//   openPaystackCheckout — opens the Paystack popup with the publishable key
//     the SERVER returned from initialize (same test/live mode it verifies
//     in), and reports exactly one outcome: "success" (popup callback) or
//     "closed" (popup dismissed without a callback).
//   confirmPayment — after "success": asks the server to verify. The server
//     decides; this only retries a few times while the answer is "not
//     confirmed yet" (202) or "provider unreachable" (503), since both leave
//     the payment state untouched and are safe to repeat.
//   reportCancelled — after "closed": tells the server, which checks with
//     Paystack and releases the reserved stock/capacity — or finalizes the
//     order if the payment actually went through.
//
// Nothing here is proof of payment; it only drives the UI.

import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { loadPaystackScript } from "./loadPaystackScript";
import type { InitializeCheckoutResponse } from "@/types/checkout";

export type PopupOutcome = "success" | "closed";

export async function openPaystackCheckout(init: InitializeCheckoutResponse, onOutcome: (outcome: PopupOutcome) => void): Promise<void> {
  await loadPaystackScript();
  const publicKey = init.publicKey || process.env.NEXT_PUBLIC_PAYSTACK_KEY;
  if (!publicKey || !window.PaystackPop) {
    throw new Error("Payment isn't available right now.");
  }

  // Paystack may fire onClose after a successful callback too — only the
  // first signal counts.
  let settled = false;
  const settle = (outcome: PopupOutcome) => {
    if (settled) return;
    settled = true;
    onOutcome(outcome);
  };

  window.PaystackPop.setup({
    key: publicKey,
    email: init.email,
    amount: init.amountKobo,
    ref: init.reference,
    currency: init.currency ?? "NGN",
    onClose: () => settle("closed"),
    callback: () => settle("success"),
  }).openIframe();
}

export type ConfirmOutcome =
  | { kind: "success" }
  // Not confirmed yet / provider unreachable after every retry. The order is
  // NOT lost: the webhook and the reconciler finish it server-side.
  | { kind: "unconfirmed"; message: string }
  | { kind: "failed"; message: string };

const RETRY_DELAYS_MS = [2000, 3000, 5000];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function confirmPayment(reference: string): Promise<ConfirmOutcome> {
  let lastMessage = "We couldn't confirm your payment yet.";
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await api.post<{ status?: string; error?: string }>("/marketplace/checkout/verify", { reference });
      if (res.status === 200 && res.data.status === "success") return { kind: "success" };
      lastMessage = res.data.error ?? lastMessage; // 202 pending
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      const message = (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "We couldn't confirm your payment.";
      // 503 = provider unreachable, undefined = network error: both retryable.
      if (status !== 503 && status !== undefined) return { kind: "failed", message };
      lastMessage = message;
    }
    if (attempt >= RETRY_DELAYS_MS.length) return { kind: "unconfirmed", message: lastMessage };
    await wait(RETRY_DELAYS_MS[attempt]);
  }
}

// "paid": the server found the payment had actually succeeded and finalized it.
export async function reportCancelled(reference: string): Promise<"cancelled" | "paid" | "unsettled"> {
  try {
    const res = await api.post<{ status?: string }>("/marketplace/checkout/cancel", { reference });
    if (res.status === 200 && res.data.status === "success") return "paid";
    if (res.status === 200 && res.data.status === "cancelled") return "cancelled";
    return "unsettled";
  } catch {
    return "unsettled";
  }
}
