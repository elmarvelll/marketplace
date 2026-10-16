// src/app/checkout/page.tsx
//
// Order preview (items, editable delivery location, price breakdown) +
// "Proceed to Payment", which opens a Paystack popup
// (loadPaystackScript.ts) using the test publishable key. Real flow:
//   1. GET  .../checkout/summary       — render the preview below.
//   2. POST .../checkout/initialize    — creates the real Order rows,
//      returns a Paystack reference + amount.
//   3. Paystack popup collects payment.
//   4. POST .../checkout/verify        — server-side confirms with
//      Paystack (never trusts the popup's own callback alone) and marks
//      the orders paid. /api/webhooks/paystack does the same
//      confirmation independently, for when this call never happens
//      (tab closed right after paying).

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { isAxiosError } from "axios";
import { AlertCircle, CheckCircle2, Loader2, MapPin, ShoppingBag } from "lucide-react";
import api from "@/lib/axios";
import { confirmPayment, openPaystackCheckout, reportCancelled } from "./_components/paystackCheckout";
import type { CheckoutSummary, InitializeCheckoutResponse } from "@/types/checkout";
import MarketplacePageShell from "@/app/_components/MarketplacePageShell";

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

type PageStatus = "loading" | "ready" | "empty" | "error" | "paying" | "verifying" | "success" | "payment-error";

export default function CheckoutPage() {
  const [status, setStatus] = useState<PageStatus>("loading");
  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  // Neutral (non-error) feedback, e.g. after the buyer closes the payment popup.
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await api.get<CheckoutSummary>("/marketplace/checkout/summary");
        if (cancelled) return;
        setSummary(res.data);
        setLocation(res.data.location);
        setStatus(res.data.items.length === 0 ? "empty" : "ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleProceedToPayment = async () => {
    if (!location.trim()) {
      setError("Please add a delivery location.");
      return;
    }

    setError("");
    setNotice("");
    setStatus("paying");

    try {
      const res = await api.post<InitializeCheckoutResponse>("/marketplace/checkout/initialize", { location });
      const init = res.data;

      await openPaystackCheckout(init, (outcome) => {
        if (outcome === "success") verifyPayment(init.reference);
        else handlePopupClosed(init.reference);
      });
    } catch (err) {
      const message =
        (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) ||
        (err instanceof Error ? err.message : "Couldn't start payment. Please try again.");
      setError(message);
      setStatus("ready");
    }
  };

  // The popup reported success. That's only the browser's word — the server
  // verifies with Paystack (amount, currency, reference) before any order
  // becomes real. See _components/paystackCheckout.ts.
  const verifyPayment = async (reference: string) => {
    setStatus("verifying");
    const outcome = await confirmPayment(reference);
    if (outcome.kind === "success") {
      setStatus("success");
    } else if (outcome.kind === "unconfirmed") {
      setNotice("");
      setError(`${outcome.message} If you were charged, your order will be confirmed automatically — check My Orders shortly before paying again.`);
      setStatus("payment-error");
    } else {
      setNotice("");
      setError(outcome.message);
      setStatus("payment-error");
    }
  };

  // The popup was closed without paying. The server checks with Paystack
  // and releases what this attempt reserved; the cart is never touched, so
  // the buyer can simply try again.
  const handlePopupClosed = async (reference: string) => {
    setStatus("verifying");
    const result = await reportCancelled(reference);
    if (result === "paid") {
      setStatus("success");
      return;
    }
    setError("");
    setNotice("Payment cancelled — you haven't been charged and your cart is unchanged.");
    setStatus("ready");
  };

  return (
    <MarketplacePageShell width="2xl">

        {status === "loading" && (
          <div className="flex justify-center py-24">
            <Loader2 size={28} className="animate-spin text-gray-500" />
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center text-center py-24">
            <AlertCircle size={28} className="text-gray-500 mb-3" />
            <p className="text-gray-500">Couldn&apos;t load your checkout. Please try again.</p>
          </div>
        )}

        {status === "empty" && (
          <div className="flex flex-col items-center text-center py-24 bg-white rounded-2xl border border-gray-100">
            <ShoppingBag size={28} className="text-gray-400 mb-3" />
            <p className="text-gray-500 mb-4">Your cart is empty.</p>
            <Link href="/" className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition">
              Browse the marketplace
            </Link>
          </div>
        )}

        {status === "success" && (
          <div className="text-center bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
            <div className="w-14 h-14 rounded-full bg-green-50 text-green-700 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={28} />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Order placed!</h1>
            <p className="text-sm text-gray-500 mb-8">Your payment was confirmed and your order is on its way to the seller.</p>
            <Link
              href="/"
              className="block w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full transition"
            >
              Back to Marketplace
            </Link>
          </div>
        )}

        {summary && (status === "ready" || status === "paying" || status === "verifying" || status === "payment-error") && (
          <>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Checkout</h1>
            <p className="text-gray-500 mb-8">Review your order before paying.</p>

            <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <h2 className="font-semibold text-gray-900 mb-4">Your order</h2>
              <div className="space-y-4">
                {summary.items.map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                      {item.image ? (
                        <Image src={item.image} alt={item.productName} fill sizes="56px" className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px]">No image</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.productName}</p>
                      <p className="text-xs text-gray-500">by {item.sellerName}</p>
                      {item.variantName && <p className="text-xs text-gray-500">{item.variantName}</p>}
                      <p className="text-xs text-gray-500 mt-0.5">Qty {item.quantity}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Est. delivery: {item.estimatedDeliveryDate} · {item.deliveryWindow}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 shrink-0">
                      ₦{nairaFormatter.format(item.price * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <label htmlFor="location" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <MapPin size={16} className="text-gray-500" />
                Delivery location
              </label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={status === "paying" || status === "verifying"}
                placeholder="e.g. Block C, Female Hostel"
                className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
              />
            </section>

            <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 space-y-2 text-sm">
              <div className="flex items-center justify-between text-gray-600">
                <span>Subtotal</span>
                <span>₦{nairaFormatter.format(summary.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span>Service fee</span>
                <span>₦{nairaFormatter.format(summary.serviceFee)}</span>
              </div>
              <div className="flex items-center justify-between font-bold text-gray-900 pt-2 border-t border-gray-100">
                <span>Total</span>
                <span>₦{nairaFormatter.format(summary.total)}</span>
              </div>
            </section>

            {error && <div role="alert" className="text-sm p-3 rounded-lg text-red-700 bg-red-100 mb-4">{error}</div>}
            {notice && !error && <div role="status" className="text-sm p-3 rounded-lg text-gray-700 bg-gray-100 mb-4">{notice}</div>}

            <button
              type="button"
              onClick={handleProceedToPayment}
              disabled={status === "paying" || status === "verifying"}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {(status === "paying" || status === "verifying") && <Loader2 size={18} className="animate-spin" />}
              {status === "verifying" ? "Confirming payment…" : status === "paying" ? "Opening payment…" : "Proceed to Payment"}
            </button>
          </>
        )}
    </MarketplacePageShell>
  );
}
