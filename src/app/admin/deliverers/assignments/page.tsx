// src/app/admin/deliverers/assignments/page.tsx
//
// Delivery coordinator's "who has what right now" overview — every
// approved deliverer, their pending pickup handoffs (with the still-valid
// pickup code, in case it needs to be re-read after
// ../../deliveries/page.tsx's assign screen), and their currently-active
// delivery items. See services/marketplace/delivery/list-deliverer-assignments.ts.
// Chrome (navbar + admin tab menu) comes from ../../layout.tsx.

"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, Loader2 } from "lucide-react";
import api from "@/lib/axios";

interface PendingHandoff {
  handoffId: string;
  businessId: string;
  businessName: string;
  pickupOtp: string | null;
  pickupOtpExpiry: string | null;
  pickupOtpAttempts: number;
}

interface ActiveItem {
  deliveryItemId: string;
  status: string;
  quantity: number;
  businessName: string;
  productName: string;
  orderId: string;
  bookedFor: string | null;
  slotLabel: string | null;
}

const dateFormatter = new Intl.DateTimeFormat("en-NG", { month: "short", day: "numeric" });

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

interface DelivererAssignments {
  delivererId: string;
  delivererName: string;
  pendingHandoffs: PendingHandoff[];
  activeItems: ActiveItem[];
}

export default function AdminDelivererAssignmentsPage() {
  const [deliverers, setDeliverers] = useState<DelivererAssignments[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");

  const load = async () => {
    setLoadState("loading");
    try {
      const res = await api.get<{ deliverers: DelivererAssignments[] }>("/marketplace/admin/deliverers/assignments");
      setDeliverers(res.data.deliverers);
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
        <p className="text-gray-500">{loadState === "forbidden" ? "Admin access required." : "Couldn't load assignments."}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Deliverer assignments</h1>
      <p className="text-sm text-gray-500 mb-6">Every approved deliverer, what&apos;s currently assigned to them, and any still-valid pickup codes.</p>

      {deliverers.length === 0 ? (
        <p className="text-sm text-gray-500">No approved deliverers yet.</p>
      ) : (
        <div className="space-y-4">
          {deliverers.map((deliverer) => (
            <div key={deliverer.delivererId} className="bg-white rounded-2xl border border-gray-100 p-5">
              {/* Assigned deliverer name is the dominant element on this
                  card (spec §15) — large, bold, with an initials avatar —
                  never buried in small text. */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {initials(deliverer.delivererName)}
                </div>
                <p className="text-lg font-bold text-gray-900">{deliverer.delivererName}</p>
              </div>

              {deliverer.pendingHandoffs.length > 0 && (
                <div className="mb-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Waiting to be picked up</p>
                  {deliverer.pendingHandoffs.map((handoff) => (
                    <div key={handoff.handoffId} className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-900">
                      <p>
                        <strong>{handoff.businessName}</strong>
                        {handoff.pickupOtp && (
                          <>
                            {" — "}
                            <span className="font-mono font-bold tracking-widest">
                              {handoff.pickupOtp.slice(0, 3)} {handoff.pickupOtp.slice(3)}
                            </span>
                          </>
                        )}
                      </p>
                      {handoff.pickupOtpExpiry && (
                        <p className="text-xs text-blue-700">
                          Valid until {new Date(handoff.pickupOtpExpiry).toLocaleString()} · {handoff.pickupOtpAttempts} attempt(s) so far
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {deliverer.activeItems.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Currently assigned</p>
                  {Object.entries(
                    deliverer.activeItems.reduce<Record<string, ActiveItem[]>>((acc, item) => {
                      (acc[item.orderId] ??= []).push(item);
                      return acc;
                    }, {})
                  ).map(([orderId, items]) => {
                    const first = items[0];
                    return (
                      <div key={orderId} className="border border-gray-100 rounded-xl p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-medium text-gray-900">
                            {first.businessName} · Order #{orderId.slice(0, 8)}
                          </p>
                          {first.bookedFor && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                              {dateFormatter.format(new Date(first.bookedFor))} · {first.slotLabel}
                            </span>
                          )}
                        </div>
                        <ul className="text-sm text-gray-600 space-y-0.5">
                          {items.map((item) => (
                            <li key={item.deliveryItemId} className="flex justify-between">
                              <span>
                                {item.quantity} x {item.productName}
                              </span>
                              <span className="text-gray-500">{item.status}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ) : (
                deliverer.pendingHandoffs.length === 0 && <p className="text-xs text-gray-500">Nothing assigned right now.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
