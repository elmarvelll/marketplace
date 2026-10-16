// src/app/admin/dropoffs/page.tsx
//
// Delivery coordinator's "who's at the counter right now" screen — orders
// whose seller has requested the Seller -> Coordinator handoff (an OTP is
// issued) and is waiting for the coordinator to key it in. Modeled on
// ../deliveries/page.tsx's loadState/forbidden/error pattern. Chrome
// (navbar + admin tab menu) comes from ../layout.tsx. See
// docs/marketplace/systems/delivery-coordinator-system.md.

"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, Loader2 } from "lucide-react";
import api from "@/lib/axios";

interface PendingDropoff {
  orderId: string;
  businessId: string;
  businessName: string;
  customerName: string;
  itemCount: number;
  quantity: number;
  otpExpiry: string | null;
  otpAttempts: number;
  estimatedDeliveryAt: string | null;
  expectedDropoffDeadline: string | null;
}

const dropoffDateFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });

export default function AdminDropoffsPage() {
  const [dropoffs, setDropoffs] = useState<PendingDropoff[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");
  const [otpByOrder, setOtpByOrder] = useState<Record<string, string>>({});
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [messageByOrder, setMessageByOrder] = useState<Record<string, string>>({});

  const load = async () => {
    setLoadState("loading");
    try {
      const res = await api.get<{ dropoffs: PendingDropoff[] }>("/marketplace/admin/dropoffs");
      setDropoffs(res.data.dropoffs);
      setLoadState("loaded");
    } catch (err) {
      setLoadState(isAxiosError(err) && err.response?.status === 403 ? "forbidden" : "error");
    }
  };

  useEffect(() => {
    // Locally-defined wrapper — same convention as
    // src/app/_components/useCart.ts.
    const run = async () => {
      await load();
    };
    run();
  }, []);

  const confirm = async (orderId: string) => {
    const otp = (otpByOrder[orderId] ?? "").trim();
    console.log("Confirming drop-off for order", orderId, "with OTP", otp);
    if (!otp) return;
    setBusyOrderId(orderId);
    setMessageByOrder((current) => ({ ...current, [orderId]: "" }));
    try {
      await api.post(`/marketplace/admin/dropoffs/${orderId}/confirm`, { otp });
      setOtpByOrder((current) => ({ ...current, [orderId]: "" }));
      await load();
    } catch (err) {
      const message = (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Confirmation failed.";
      setMessageByOrder((current) => ({ ...current, [orderId]: message }));
    } finally {
      setBusyOrderId(null);
    }
  };

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (loadState === "forbidden" || loadState === "error") {
    return (
      <div className="flex flex-col items-center text-center py-24 px-4">
        <AlertCircle size={28} className="text-gray-500 mb-3" />
        <p className="text-gray-500">{loadState === "forbidden" ? "Admin access required." : "Couldn't load drop-offs."}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Drop-offs</h1>
      <p className="text-sm text-gray-500 mb-6">
        Sellers waiting at the central drop-off point. Enter the code the seller shows you to receive their order.
      </p>

      {dropoffs.length === 0 ? (
        <p className="text-sm text-gray-500">No sellers waiting to be received.</p>
      ) : (
        <div className="space-y-3">
          {dropoffs.map((dropoff) => (
            <div key={dropoff.orderId} className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{dropoff.businessName}</p>
                  <p className="text-xs text-gray-500">
                    Order #{dropoff.orderId.slice(0, 8)} · Customer {dropoff.customerName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {dropoff.quantity} item(s) across {dropoff.itemCount} line(s)
                  </p>
                  {dropoff.estimatedDeliveryAt && (
                    <p className="text-xs text-gray-500 mt-1">
                      Customer delivery date: {new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(dropoff.estimatedDeliveryAt))}
                    </p>
                  )}
                  {dropoff.expectedDropoffDeadline && (
                    <p className="text-xs font-semibold text-amber-700 mt-0.5">
                      Expected drop-off by: {dropoffDateFormatter.format(new Date(dropoff.expectedDropoffDeadline))}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-gray-500">
                  {dropoff.otpExpiry && <p>Code expires {new Date(dropoff.otpExpiry).toLocaleTimeString()}</p>}
                  <p>{dropoff.otpAttempts} attempt(s) so far</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit code"
                  value={otpByOrder[dropoff.orderId] ?? ""}
                  onChange={(e) => setOtpByOrder((current) => ({ ...current, [dropoff.orderId]: e.target.value }))}
                  className="px-4 py-2 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 w-40"
                />
                <button
                  type="button"
                  disabled={busyOrderId === dropoff.orderId || !(otpByOrder[dropoff.orderId] ?? "").trim()}
                  onClick={() => confirm(dropoff.orderId)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-50"
                >
                  {busyOrderId === dropoff.orderId ? "Confirming…" : "Confirm"}
                </button>
                {messageByOrder[dropoff.orderId] && (
                  <span className="text-sm text-red-600">{messageByOrder[dropoff.orderId]}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
