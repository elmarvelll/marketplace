// src/app/vendor-dashboard/[id]/orders/page.tsx
//
// The vendor's own Orders tab — no accept/reject controls (spec §6: a
// vendor never accepts/rejects, payment confirmation auto-accepts).
// The default "All orders" view is the backend's own order: NEWEST first by
// order creation time (never re-sorted client-side, and never by delivery
// date). The delivery-date tabs are filters over that same list, grouped by
// TIMEFRAME (spec §8), each group still newest-first. Per
// order: a ✓ check (mark ready — spec §11) and an ✗ X (couldn't fulfill /
// refund — spec §11), both backend-persisted and disabled while their own
// request is in flight (spec §30). No "Mark Read" and no "Deliverer
// Waiting to Pick Up" vendor action exist here (spec §12-13) — the only
// deliverer-related UI is the read-only "here's your pickup code" banner
// below, driven entirely by delivery assignment, never a vendor action.

"use client";

import { use, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Loader2, Package, ShieldCheck, X } from "lucide-react";
import api from "@/lib/axios";

interface VendorOrderItem {
  id: string;
  productName: string;
  quantity: number;
  price: number;
  deliveryStatus: string | null;
  rejectedAt: string | null;
}

interface VendorOrder {
  id: string;
  status: string;
  fulfillmentStatus: string | null;
  deliveryOutcome: string;
  totalAmount: number;
  createdAt: string;
  sellerMarkedReadyAt: string | null;
  deliveryLocation: string | null;
  isDisputed: boolean;
  bookedFor: string | null;
  slot: { id: string; label: string; windowStart: string } | null;
  items: VendorOrderItem[];
}

interface PendingPickup {
  id: string;
  pickupOtp: string | null;
  pickupOtpExpiry: string | null;
  delivererName: string;
}

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("en-NG", { weekday: "short", month: "long", day: "numeric" });

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

export default function VendorOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [pendingPickups, setPendingPickups] = useState<PendingPickup[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  // Tracks which order has an action in flight, and which action, so both
  // buttons on that one order are disabled without freezing the rest of
  // the list (spec §30 — never block unrelated actions, never double-submit).
  const [busy, setBusy] = useState<{ orderId: string; action: "ready" | "fail" } | null>(null);
  const [justCompleted, setJustCompleted] = useState<{ orderId: string; outcome: "ready" | "failed" } | null>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);

  const load = async () => {
    setLoadState("loading");
    try {
      const res = await api.get<{ orders: VendorOrder[]; pendingPickups: PendingPickup[] }>(`/marketplace/vendor/${id}/orders`);
      setOrders(res.data.orders);
      setPendingPickups(res.data.pendingPickups);
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  };

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Group by delivery date -> timeframe. Orders with no booking (shouldn't
  // happen for a vendor order, but kept safe) fall under "Unscheduled".
  // Dates sort ascending (earliest delivery day first); slots sort by
  // windowStart; orders within a slot keep the API's newest-first order.
  const grouped = useMemo(() => {
    const byDate = new Map<string, Map<string, { label: string; windowStart: string; orders: VendorOrder[] }>>();
    for (const order of orders) {
      const key = order.bookedFor ? dateKey(order.bookedFor) : "unscheduled";
      const slotKey = order.slot?.id ?? "none";
      if (!byDate.has(key)) byDate.set(key, new Map());
      const slots = byDate.get(key)!;
      if (!slots.has(slotKey)) {
        slots.set(slotKey, { label: order.slot?.label ?? "No timeframe", windowStart: order.slot?.windowStart ?? "99:99", orders: [] });
      }
      slots.get(slotKey)!.orders.push(order);
    }
    const dates = Array.from(byDate.keys()).sort();
    return dates.map((date) => ({
      date,
      slots: Array.from(byDate.get(date)!.values()).sort((a, b) => a.windowStart.localeCompare(b.windowStart)),
    }));
  }, [orders]);

  // Defaults to "all" — every order, newest first — until the vendor picks a
  // delivery-date tab. Falls back to "all" if the chosen date no longer has
  // orders after a refresh.
  const effectiveActiveDate = activeDate && grouped.some((g) => g.date === activeDate) ? activeDate : "all";

  const markReady = async (orderId: string) => {
    if (busy) return;
    setBusy({ orderId, action: "ready" });
    try {
      await api.post(`/marketplace/vendor/${id}/orders/${orderId}/ready`);
      setJustCompleted({ orderId, outcome: "ready" });
      await load();
    } finally {
      setBusy(null);
      setTimeout(() => setJustCompleted((c) => (c?.orderId === orderId ? null : c)), 900);
    }
  };

  const markFailed = async (orderId: string) => {
    if (busy) return;
    if (!window.confirm("Mark this order as unable to be fulfilled? The customer will be refunded.")) return;
    setBusy({ orderId, action: "fail" });
    try {
      await api.post(`/marketplace/vendor/${id}/orders/${orderId}/fail`);
      setJustCompleted({ orderId, outcome: "failed" });
      await load();
    } finally {
      setBusy(null);
      setTimeout(() => setJustCompleted((c) => (c?.orderId === orderId ? null : c)), 900);
    }
  };

  const activeGroup = grouped.find((g) => g.date === effectiveActiveDate);
  const placedFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });

  // One order card — shared by the "All orders" list and the per-date groups.
  const renderOrder = (order: VendorOrder, showDelivery: boolean) => {
    const isBusy = busy?.orderId === order.id;
    const completed = justCompleted?.orderId === order.id;
    return (
      <div
        key={order.id}
        className={`bg-white rounded-2xl border p-4 transition-all duration-300 ${
          completed && justCompleted?.outcome === "ready"
            ? "border-green-300 shadow-[0_0_0_3px_rgba(34,197,94,0.12)]"
            : completed && justCompleted?.outcome === "failed"
              ? "border-red-300 shadow-[0_0_0_3px_rgba(239,68,68,0.12)]"
              : "border-gray-100"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <p className="font-medium text-gray-900 text-sm">
              Order #{order.id.slice(0, 8)}
            </p>
            <p className="text-xs text-gray-500">
              Placed {placedFormatter.format(new Date(order.createdAt))}
              {showDelivery && order.bookedFor && ` · Delivery ${dateFormatter.format(new Date(order.bookedFor))}${order.slot ? `, ${order.slot.label}` : ""}`}
            </p>
            <p className="text-xs text-gray-500">
              {order.fulfillmentStatus?.replace(/_/g, " ") ?? "Processing"}
              {order.deliveryOutcome !== "PENDING" && ` · ${order.deliveryOutcome.replace(/_/g, " ").toLowerCase()}`}
              {order.isDisputed && <span className="text-red-600 font-medium"> · Disputed</span>}
            </p>
          </div>
          <p className="font-semibold text-gray-900">₦{nairaFormatter.format(order.totalAmount)}</p>
        </div>

        <ul className="space-y-1 mb-3">
          {order.items.map((item) => (
            <li key={item.id} className="text-sm text-gray-700 flex justify-between">
              <span>
                {item.quantity} x {item.productName}
              </span>
              <span className="text-gray-500">
                {item.rejectedAt ? "Refunded" : (item.deliveryStatus?.replace(/_/g, " ") ?? "Preparing")}
              </span>
            </li>
          ))}
        </ul>

        {order.fulfillmentStatus === "PROCESSING" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => markReady(order.id)}
              aria-label="Mark ready"
              className={`flex items-center justify-center w-9 h-9 rounded-full bg-green-50 hover:bg-green-100 text-green-700 transition disabled:opacity-50 active:scale-90 ${
                completed && justCompleted?.outcome === "ready" ? "scale-110" : ""
              }`}
            >
              {isBusy && busy?.action === "ready" ? <Loader2 size={16} className="animate-spin" /> : <Check size={18} strokeWidth={3} />}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => markFailed(order.id)}
              aria-label="Mark failed"
              className={`flex items-center justify-center w-9 h-9 rounded-full bg-red-50 hover:bg-red-100 text-red-600 transition disabled:opacity-50 active:scale-90 ${
                completed && justCompleted?.outcome === "failed" ? "scale-110" : ""
              }`}
            >
              {isBusy && busy?.action === "fail" ? <Loader2 size={16} className="animate-spin" /> : <X size={18} strokeWidth={3} />}
            </button>
            <span className="text-xs text-gray-500">Mark ready, or mark failed to refund</span>
          </div>
        )}
        {order.fulfillmentStatus === "READY_FOR_PICKUP" && (
          <span className="text-xs font-medium px-3 py-1.5 rounded-full bg-green-50 text-green-700">
            Ready — waiting for deliverer
          </span>
        )}
      </div>
    );
  };


  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Orders</h1>

      {pendingPickups.length > 0 && (
        <div className="mb-6 space-y-2">
          {pendingPickups.map((pickup) => (
            <div key={pickup.id} className="flex items-center gap-3 bg-purple-50 border border-purple-100 rounded-2xl p-4">
              <ShieldCheck size={20} className="text-purple-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-purple-900">{pickup.delivererName} is assigned to collect from you</p>
                <p className="text-xs text-purple-700">
                  Give them this code when they arrive: <span className="font-bold tracking-wider">{pickup.pickupOtp}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {loadState === "loading" && (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-500" />
        </div>
      )}

      {loadState === "error" && (
        <div className="flex flex-col items-center text-center py-16">
          <AlertCircle size={24} className="text-gray-500 mb-3" />
          <p className="text-gray-500">Couldn&apos;t load your orders.</p>
        </div>
      )}

      {loadState === "loaded" && orders.length === 0 && (
        <div className="flex flex-col items-center text-center py-24 bg-white rounded-2xl border border-gray-100">
          <Package size={28} className="text-gray-400 mb-3" />
          <p className="text-gray-500">No orders yet.</p>
        </div>
      )}

      {loadState === "loaded" && orders.length > 0 && (
        <div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4" role="tablist" aria-label="Filter orders by delivery date">
            <button
              type="button"
              role="tab"
              aria-selected={effectiveActiveDate === "all"}
              onClick={() => setActiveDate(null)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition ${
                effectiveActiveDate === "all" ? "bg-purple-600 text-white" : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              All orders · newest first
            </button>
            {grouped.map((g) => (
              <button
                key={g.date}
                type="button"
                role="tab"
                aria-selected={effectiveActiveDate === g.date}
                onClick={() => setActiveDate(g.date)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition ${
                  effectiveActiveDate === g.date ? "bg-purple-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {g.date === "unscheduled" ? "Unscheduled" : dateFormatter.format(new Date(`${g.date}T00:00:00Z`))}
              </button>
            ))}
          </div>

          {effectiveActiveDate === "all" && <div className="space-y-3">{orders.map((order) => renderOrder(order, true))}</div>}

          {activeGroup && (
            <div className="space-y-8">
              {activeGroup.slots.map((slot) => {
                const allProcessed = slot.orders.every((o) => o.fulfillmentStatus !== "PROCESSING");
                return (
                  <div key={slot.label}>
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="font-semibold text-gray-900">{slot.label}</h2>
                      {allProcessed && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700">All processed</span>
                      )}
                      <span className="text-xs text-gray-500">
                        {slot.orders.length} order{slot.orders.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {slot.orders.map((order) => renderOrder(order, false))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
