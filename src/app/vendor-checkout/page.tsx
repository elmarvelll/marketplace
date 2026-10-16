// src/app/vendor-checkout/page.tsx
//
// Vendor checkout — mirrors the Business checkout/page.tsx flow exactly
// (summary -> Paystack popup -> server-side verify), with the two Vendor-
// specific additions: a delivery slot picker (spec §17/§20/§21) and the
// fee breakdown showing subtotal + service fee + delivery fee separately.
// Real flow:
//   1. GET  .../vendor-checkout/summary    — cart, fees, live slot
//      availability (see calculate-vendor-checkout-summary.ts).
//   2. POST .../vendor-checkout/initialize — books the Orders + one
//      VendorDeliveryBooking as PENDING_PAYMENT (transactional, stock +
//      slot capacity re-checked — see create-vendor-orders-for-checkout.ts),
//      returns a Paystack reference + amount.
//   3. Paystack popup collects payment.
//   4. POST .../checkout/verify — the SAME endpoint the Business flow
//      uses; confirmPaymentByReference.ts additively confirms a vendor
//      booking when the reference has one (see
//      docs/marketplace/decisions/vendor-extends-business.md).

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { isAxiosError } from "axios";
import { AlertCircle, CheckCircle2, Clock, Loader2, MapPin, ShoppingBag } from "lucide-react";
import api from "@/lib/axios";
import { confirmPayment, openPaystackCheckout, reportCancelled } from "../checkout/_components/paystackCheckout";
import DeliveryDatePicker, { todayIsoDate } from "./_components/DeliveryDatePicker";
import type { VendorCartLineItem } from "@/types/vendor-cart";
import type { InitializeCheckoutResponse } from "@/types/checkout";
import MarketplacePageShell from "@/app/_components/MarketplacePageShell";

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

interface VendorSlot {
  id: string;
  label: string;
  windowStart: string;
  windowEnd: string;
  capacity: number;
  booked: number;
  bookable: boolean;
}

interface VendorFees {
  subtotal: number;
  chargeableItemCount: number;
  serviceFee: number;
  deliveryFee: number;
  total: number;
}

interface VendorCheckoutSummary {
  items: VendorCartLineItem[];
  fees: VendorFees;
  slots: VendorSlot[];
  date: string;
  // Which dates in the booking window can be chosen (see calculate-vendor-checkout-summary.ts).
  dates?: { date: string; selectable: boolean; reason: string }[];
}

type PageStatus = "loading" | "ready" | "empty" | "error" | "paying" | "verifying" | "success" | "payment-error";

export default function VendorCheckoutPage() {
  const [status, setStatus] = useState<PageStatus>("loading");
  const [summary, setSummary] = useState<VendorCheckoutSummary | null>(null);
  const [location, setLocation] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [deliveryDate, setDeliveryDate] = useState(() => todayIsoDate());
  // Scoped loading state for just the slot-availability section when the
  // date changes — the rest of the page (items, location, fees) stays put
  // so switching dates doesn't jump the whole layout (spec §1/§30).
  const [slotsRefreshing, setSlotsRefreshing] = useState(false);
  // Bumped to re-fetch availability after a cancelled payment releases its reservation.
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  // Neutral (non-error) feedback, e.g. after the buyer closes the payment popup.
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await api.get<VendorCheckoutSummary>("/marketplace/vendor-checkout/summary", {
          params: { date: deliveryDate },
        });
        if (cancelled) return;
        setSummary(res.data);
        // If the date being shown can't be booked (vendor closed that day,
        // fully booked, today's windows have passed), move to the first date
        // that can — the effect re-runs for it. The server re-validates the
        // final choice at initialize regardless.
        const offered = res.data.dates ?? [];
        const current = offered.find((d) => d.date === res.data.date);
        const firstOpen = offered.find((d) => d.selectable);
        if (current && !current.selectable && firstOpen && res.data.items.length > 0) {
          setDeliveryDate(firstOpen.date);
          setSelectedSlotId(null);
          return;
        }
        setSelectedSlotId((current) => (res.data.slots.some((s) => s.id === current) ? current : null));
        setStatus((current) => (current === "loading" ? (res.data.items.length === 0 ? "empty" : "ready") : current));
      } catch {
        if (!cancelled) setStatus("error");
      } finally {
        if (!cancelled) setSlotsRefreshing(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [deliveryDate, refreshKey]);

  const handleDateChange = (nextDate: string) => {
    if (nextDate === deliveryDate) return;
    setDeliveryDate(nextDate);
    setSlotsRefreshing(true);
  };

  const handleBookOrder = async () => {
    if (!location.trim()) {
      setError("Please add a delivery location.");
      return;
    }
    if (!selectedSlotId) {
      setError("Please select a delivery slot.");
      return;
    }

    setError("");
    setNotice("");
    setStatus("paying");

    try {
      const res = await api.post<InitializeCheckoutResponse>("/marketplace/vendor-checkout/initialize", {
        slotId: selectedSlotId,
        location,
        date: deliveryDate,
      });
      const init = res.data;

      await openPaystackCheckout(init, (outcome) => {
        if (outcome === "success") verifyPayment(init.reference);
        else handlePopupClosed(init.reference);
      });
    } catch (err) {
      const message =
        (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) ||
        (err instanceof Error ? err.message : "Couldn't start booking. Please try again.");
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
    setRefreshKey((k) => k + 1);
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
            <p className="text-gray-500 mb-4">Your Vendor cart is empty.</p>
            <Link href="/" className="text-sm font-semibold text-purple-600 hover:text-purple-700 transition">
              Browse School Vendors
            </Link>
          </div>
        )}

        {status === "success" && (
          <div className="text-center bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
            <div className="w-14 h-14 rounded-full bg-green-50 text-green-700 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={28} />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Order booked!</h1>
            <p className="text-sm text-gray-500 mb-8">
              Your payment was confirmed. The vendor is preparing your order for your selected delivery slot.
            </p>
            <Link
              href="/"
              className="block w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-full transition"
            >
              Back to Marketplace
            </Link>
          </div>
        )}

        {summary && (status === "ready" || status === "paying" || status === "verifying" || status === "payment-error") && (
          <>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Vendor Checkout</h1>
            <p className="text-gray-500 mb-8">Review your order, pick a delivery slot, then pay.</p>

            <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <h2 className="font-semibold text-gray-900 mb-4">Your order</h2>
              <div className="space-y-4">
                {summary.items.map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                      {item.image ? (
                        <Image src={item.image} alt={item.name} fill sizes="56px" className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 text-[10px]">
                          {item.kind === "side" ? "Side" : "No image"}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                      <p className="text-xs text-gray-500">by {item.vendorName}</p>
                      {item.variantName && <p className="text-xs text-gray-500">{item.variantName}</p>}
                      <p className="text-xs text-gray-500 mt-0.5">Qty {item.quantity}</p>
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
                className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition disabled:opacity-60"
              />
            </section>

            <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <DeliveryDatePicker
                value={deliveryDate}
                onChange={handleDateChange}
                disabled={status === "paying" || status === "verifying"}
                dates={summary.dates}
              />
            </section>

            <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
              <p className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Clock size={16} className="text-gray-500" />
                Delivery slot
              </p>
              {slotsRefreshing ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={20} className="animate-spin text-gray-500" />
                </div>
              ) : (
              <div className="space-y-2">
                {summary.slots.length === 0 && <p className="text-sm text-gray-500">No delivery slots configured.</p>}
                {summary.slots.map((slot) => {
                  const disabled = !slot.bookable;
                  const selected = selectedSlotId === slot.id;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={disabled || status === "paying" || status === "verifying"}
                      onClick={() => setSelectedSlotId(slot.id)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition disabled:opacity-40 disabled:cursor-not-allowed ${
                        selected ? "border-purple-500 bg-purple-50 text-purple-800" : "border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="font-medium">{slot.label}</span>
                      <span className="text-xs text-gray-500">{disabled ? "Unavailable" : `${slot.capacity - slot.booked} spot(s) left`}</span>
                    </button>
                  );
                })}
              </div>
              )}
            </section>

            <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 space-y-2 text-sm">
              <div className="flex items-center justify-between text-gray-600">
                <span>Subtotal</span>
                <span>₦{nairaFormatter.format(summary.fees.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span>Service fee ({summary.fees.chargeableItemCount} item{summary.fees.chargeableItemCount === 1 ? "" : "s"})</span>
                <span>₦{nairaFormatter.format(summary.fees.serviceFee)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span>Delivery fee</span>
                <span>₦{nairaFormatter.format(summary.fees.deliveryFee)}</span>
              </div>
              <div className="flex items-center justify-between font-bold text-gray-900 pt-2 border-t border-gray-100">
                <span>Total</span>
                <span>₦{nairaFormatter.format(summary.fees.total)}</span>
              </div>
            </section>

            {error && <div role="alert" className="text-sm p-3 rounded-lg text-red-700 bg-red-100 mb-4">{error}</div>}
            {notice && !error && <div role="status" className="text-sm p-3 rounded-lg text-gray-700 bg-gray-100 mb-4">{notice}</div>}

            <button
              type="button"
              onClick={handleBookOrder}
              disabled={status === "paying" || status === "verifying"}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {(status === "paying" || status === "verifying") && <Loader2 size={18} className="animate-spin" />}
              {status === "verifying" ? "Confirming payment…" : status === "paying" ? "Opening payment…" : "Book an Order"}
            </button>
          </>
        )}
    </MarketplacePageShell>
  );
}
