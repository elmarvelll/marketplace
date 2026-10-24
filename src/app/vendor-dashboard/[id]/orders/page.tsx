// src/app/vendor-dashboard/[id]/orders/page.tsx
//
// The vendor's own Orders tab — for information only. A vendor never
// accepts, rejects, marks ready or fails an order: payment confirmation
// confirms it, the admin-run delivery operation collects it at the vendor's
// location, and refunds go through an admin.
// The default "All orders" view is the backend's own order: NEWEST first by
// order creation time (never re-sorted client-side, and never by delivery
// date). The delivery-date tabs are filters over that same list, grouped by
// TIMEFRAME (spec §8), each group still newest-first. The only
// deliverer-related UI is read-only: who is collecting each order, driven
// entirely by delivery assignment. There is no pickup code: the vendor just
// hands the order over, and the delivery is confirmed by the student's code.

"use client";

import { use, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Package } from "lucide-react";
import api from "@/lib/axios";

interface VendorOrderItem {
  id: string;
  productName: string;
  quantity: number;
  price: number;
  deliveryStatus: string | null;
  rejectedAt: string | null;
  refunded?: boolean;
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
  delivererName: string | null;
  items: VendorOrderItem[];
}

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("en-NG", { weekday: "short", month: "long", day: "numeric" });

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

// One plain-language status per order, from the delivery state.
function orderStatusLabel(order: VendorOrder): { text: string; tone: "info" | "progress" | "done" | "problem" } {
  if (order.status === "CANCELLED" || order.items.every((i) => i.refunded || i.rejectedAt)) return { text: "Refunded", tone: "problem" };
  if (order.deliveryOutcome === "DELIVERED" || order.deliveryOutcome === "DELIVERED_PENDING_DISPUTE_WINDOW") return { text: "Delivered", tone: "done" };
  if (order.deliveryOutcome === "FAILED") return { text: "Delivery failed", tone: "problem" };
  // HANDED_TO_DELIVERER only on orders from before pickups stopped being confirmed online.
  if (order.fulfillmentStatus === "HANDED_TO_DELIVERER") return { text: "Collected by deliverer", tone: "progress" };
  if (order.delivererName) return { text: `Processing · ${order.delivererName} will collect`, tone: "progress" };
  return { text: "Confirmed · awaiting scheduled delivery", tone: "info" };
}

const TONE_CLASS = {
  info: "bg-purple-50 text-purple-700",
  progress: "bg-blue-50 text-blue-700",
  done: "bg-green-50 text-green-700",
  problem: "bg-red-50 text-red-700",
} as const;

export default function VendorOrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const [activeDate, setActiveDate] = useState<string | null>(null);

  const load = async () => {
    setLoadState("loading");
    try {
      const res = await api.get<{ orders: VendorOrder[] }>(`/marketplace/vendor/${id}/orders`);
      setOrders(res.data.orders);
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

  const activeGroup = grouped.find((g) => g.date === effectiveActiveDate);
  const placedFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });

  // One order card — shared by the "All orders" list and the per-date groups.
  const renderOrder = (order: VendorOrder, showDelivery: boolean) => {
    const label = orderStatusLabel(order);
    return (
      <div key={order.id} className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <p className="font-medium text-gray-900 text-sm">Order #{order.id.slice(0, 8)}</p>
            <p className="text-xs text-gray-500">
              Placed {placedFormatter.format(new Date(order.createdAt))}
              {showDelivery && order.bookedFor && ` · Delivery ${dateFormatter.format(new Date(order.bookedFor))}${order.slot ? `, ${order.slot.label}` : ""}`}
            </p>
            {order.deliveryLocation && <p className="text-xs text-gray-500">Deliver to: {order.deliveryLocation}</p>}
          </div>
          <p className="font-semibold text-gray-900">₦{nairaFormatter.format(order.totalAmount)}</p>
        </div>

        <ul className="space-y-1 mb-3">
          {order.items.map((item) => (
            <li key={item.id} className="text-sm text-gray-700 flex justify-between">
              <span>
                {item.quantity} x {item.productName}
              </span>
              {(item.refunded || item.rejectedAt) && <span className="text-gray-500">Refunded</span>}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${TONE_CLASS[label.tone]}`}>{label.text}</span>
          {order.isDisputed && <span className="text-xs font-medium px-3 py-1.5 rounded-full bg-red-50 text-red-700">Disputed</span>}
        </div>
      </div>
    );
  };

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">Orders</h1>
      <p className="text-sm text-gray-500 mb-6">
        Paid orders are confirmed automatically. Have them ready for the deliverer at your location before the delivery time — there&apos;s
        nothing to accept or mark here. If you can&apos;t fulfil an order, contact the Marketplace admin.
      </p>

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
                const allDelivered = slot.orders.every((o) => o.deliveryOutcome === "DELIVERED" || o.deliveryOutcome === "DELIVERED_PENDING_DISPUTE_WINDOW" || o.status === "CANCELLED");
                return (
                  <div key={slot.label}>
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="font-semibold text-gray-900">{slot.label}</h2>
                      {allDelivered && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700">All delivered</span>
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
