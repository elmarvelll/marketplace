// src/app/deliverer/page.tsx
//
// The Delivery Dashboard — only reachable in practice via the footer's
// "Delivery Dashboard" link once a deliverer is approved (see
// services/marketplace/deliverer/deliverer.service.ts); every API call here still 403s server-side for a
// non-approved deliverer regardless of how someone reaches this URL. Shows
// pending pickup handoffs (with the seller<->deliverer OTP entry) and every
// assigned delivery item across its lifecycle. The deliverer never adds
// items manually — everything shown here came from a business marking it
// READY_FOR_PICKUP and the delivery coordinator assigning it. See
// docs/marketplace/systems/deliverer-system.md.

"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, CalendarClock, Loader2, Package, Truck } from "lucide-react";
import DashboardNavbar from "@/app/components/dashboard/student/DashboardNavbar";
import api from "@/lib/axios";
import MarketplacePageShell from "@/app/_components/MarketplacePageShell";

interface Handoff {
  id: string;
  businessId: string;
  businessName: string;
  businessLocation: string | null;
  deliveryStatus: string;
  delivererConfirmedPickupAt: string | null;
}

// The deliverer's own admin-assigned roster (date + timeframe they're on
// duty for), distinct from the per-order assignments below — see
// services/marketplace/deliverer/list-my-roster.ts and
// docs/marketplace/decisions/vendor-independent-architecture.md.
interface RosterEntry {
  id: string;
  date: string;
  status: string;
  slotLabel: string;
  windowStart: string;
  windowEnd: string;
  requiredArrivalTime: string;
  arrivalLeadMins: number;
}

interface DeliveryItemRow {
  deliveryItemId: string;
  status: string;
  quantity: number;
  businessName: string;
  businessType?: "BUSINESS" | "SCHOOL_VENDOR";
  // The vendor's own address to collect from — null/absent for a
  // Business item, which is collected from the central drop-off point
  // instead (see docs/marketplace/decisions/vendor-independent-architecture.md).
  collectionLocation?: string | null;
  productName: string;
  orderId: string;
  deliveryLocation: string | null;
  estimatedDate: string | null;
  deliveryWindow: string | null;
  failedDeliveryAttempts: number;
  retryDeliveryAt: string | null;
}

export default function DelivererDashboardPage() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [items, setItems] = useState<DeliveryItemRow[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoadState("loading");
    try {
      const [handoffsRes, itemsRes, rosterRes] = await Promise.all([
        api.get<{ handoffs: Handoff[] }>("/marketplace/deliverer/handoffs"),
        api.get<{ items: DeliveryItemRow[] }>("/marketplace/deliverer/deliveries"),
        api.get<{ roster: RosterEntry[] }>("/marketplace/deliverer/roster"),
      ]);
      setHandoffs(handoffsRes.data.handoffs);
      setItems(itemsRes.data.items);
      setRoster(rosterRes.data.roster);
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

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError("");
    try {
      await action();
      await load();
    } catch (err) {
      setError((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "That action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmPickup = (handoffId: string) => {
    const otp = window.prompt("Enter the seller's pickup OTP:");
    if (!otp) return;
    return run(handoffId, () => api.post(`/marketplace/deliverer/handoffs/${handoffId}/confirm-pickup`, { otp }));
  };
  const outForDelivery = (deliveryItemId: string) =>
    run(deliveryItemId, () => api.post(`/marketplace/deliverer/deliveries/${deliveryItemId}/out-for-delivery`));
  const deliver = (deliveryItemId: string) => {
    const otp = window.prompt("Enter the buyer's delivery OTP:");
    if (!otp) return;
    return run(deliveryItemId, () => api.post(`/marketplace/deliverer/deliveries/${deliveryItemId}/deliver`, { otp }));
  };
  const failAttempt = (deliveryItemId: string) => {
    const reason = window.prompt("Reason for the failed delivery attempt:");
    if (!reason) return;
    return run(deliveryItemId, () => api.post(`/marketplace/deliverer/deliveries/${deliveryItemId}/fail-attempt`, { reason }));
  };

  if (loadState === "loading") {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNavbar />
        <div className="flex justify-center py-24">
          <Loader2 size={28} className="animate-spin text-gray-500" />
        </div>
      </div>
    );
  }

  if (loadState === "forbidden") {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNavbar />
        <div className="flex flex-col items-center text-center py-24 px-4">
          <AlertCircle size={28} className="text-gray-500 mb-3" />
          <p className="text-gray-500">You don&apos;t have Delivery Dashboard access yet.</p>
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNavbar />
        <div className="flex flex-col items-center text-center py-24 px-4">
          <AlertCircle size={28} className="text-gray-500 mb-3" />
          <p className="text-gray-500">Couldn&apos;t load the Delivery Dashboard. Please try again.</p>
        </div>
      </div>
    );
  }

  const pendingHandoffs = handoffs.filter((h) => !h.delivererConfirmedPickupAt);

  return (
    <MarketplacePageShell width="5xl" className="space-y-10">
        <h1 className="text-2xl font-bold text-gray-900">Delivery Dashboard</h1>

        {error && <div className="text-sm p-3 rounded-lg text-red-700 bg-red-100">{error}</div>}

        <section>
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CalendarClock size={16} className="text-gray-500" />
            Upcoming schedule
          </h2>
          {roster.length === 0 ? (
            <p className="text-sm text-gray-500">You&apos;re not on the roster for any upcoming timeframe yet.</p>
          ) : (
            <div className="space-y-2">
              {roster.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      {new Date(r.date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} · {r.slotLabel}
                    </p>
                    <p className="text-xs text-gray-500">
                      Delivery window {r.windowStart}–{r.windowEnd} · Arrive by {r.requiredArrivalTime} ({r.arrivalLeadMins} min early)
                    </p>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Package size={16} className="text-gray-500" />
            Pending pickups
          </h2>
          {pendingHandoffs.length === 0 ? (
            <p className="text-sm text-gray-500">No pickups waiting on your OTP handoff.</p>
          ) : (
            <div className="space-y-2">
              {pendingHandoffs.map((h) => (
                <div key={h.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 break-words">{h.businessName}</p>
                    <p className="text-xs text-gray-500">{h.businessLocation || "No location set."}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === h.id}
                    onClick={() => confirmPickup(h.id)}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-50"
                  >
                    Enter pickup OTP
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Truck size={16} className="text-gray-500" />
            Assigned items
          </h2>
          {items.length === 0 ? (
            <p className="text-sm text-gray-500">No items assigned to you yet.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.deliveryItemId} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="font-medium text-gray-900">
                        {item.quantity} x {item.productName}
                      </p>
                      <p className="text-xs text-gray-500">{item.businessName} · Order #{item.orderId.slice(0, 8)}</p>
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{item.status}</span>
                  </div>
                  {item.businessType === "SCHOOL_VENDOR" && (
                    <p className="text-xs text-purple-700 bg-purple-50 rounded-lg px-2.5 py-1.5 mb-2 inline-block">
                      Collect from: {item.collectionLocation || "Vendor hasn't set a location yet."}
                    </p>
                  )}
                  {item.estimatedDate && (
                    <p className="text-xs text-gray-500 mb-2">
                      {item.estimatedDate} · {item.deliveryWindow} · {item.deliveryLocation || "No location set."}
                    </p>
                  )}
                  {item.failedDeliveryAttempts > 0 && (
                    <p className="text-xs text-amber-700 mb-2">
                      {item.failedDeliveryAttempts} failed attempt(s)
                      {item.retryDeliveryAt && ` · retry after ${new Date(item.retryDeliveryAt).toLocaleString()}`}
                    </p>
                  )}
                  <div className="flex gap-2">
                    {item.status === "PICKED_UP" && (
                      <button
                        type="button"
                        disabled={busyId === item.deliveryItemId}
                        onClick={() => outForDelivery(item.deliveryItemId)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition disabled:opacity-50"
                      >
                        Start delivery
                      </button>
                    )}
                    {item.status === "OUT_FOR_DELIVERY" && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === item.deliveryItemId}
                          onClick={() => deliver(item.deliveryItemId)}
                          className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition disabled:opacity-50"
                        >
                          Confirm delivery
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.deliveryItemId}
                          onClick={() => failAttempt(item.deliveryItemId)}
                          className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition disabled:opacity-50"
                        >
                          Mark failed attempt
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
    </MarketplacePageShell>
  );
}
