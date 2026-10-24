// src/app/admin/deliveries/page.tsx
//
// Delivery coordinator's assignment screen: ready items grouped by
// delivery DATE, then by ORDER (spec §20-23) — each order card shows the
// business/vendor (and its collection location for a School Vendor item —
// spec §23), the customer, and every line item, with one checkbox
// selecting the whole order at once. Approved deliverers on the other
// side — pick one, assign; or "Assign as planned", which sends each selected
// order to the deliverer the Delivery Roster planned for it (through the same
// assign-delivery.ts). Chrome (navbar + admin tab menu) comes from
// ../layout.tsx. See docs/marketplace/systems/delivery-coordinator-system.md.

"use client";

import { useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, Loader2, MapPin } from "lucide-react";
import api from "@/lib/axios";

interface ReadyItem {
  id: string;
  orderId: string;
  quantity: number;
  productName: string;
  businessName: string;
  businessType: string;
  customerName: string;
  orderCreatedAt: string;
  collectionLocation: string | null;
  sellerDroppedOffAt: string | null;
  bookedFor: string | null;
  slot: { id: string; label: string } | null;
  // From the Delivery Roster: who this order's delivery is planned for.
  plannedDeliverer: { id: string; name: string; approved: boolean; source: "ROSTER" | "MANUAL" | "SUGGESTED" } | null;
}

interface DelivererRow {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
}

// pickupOtp is null for a School Vendor handoff — Vendor Market deliveries
// have no pickup code (assign-delivery.ts).
interface AssignedHandoff {
  businessId: string;
  businessName: string;
  pickupOtp: string | null;
  pickupOtpExpiry: string | null;
}
type CodedHandoff = AssignedHandoff & { pickupOtp: string; pickupOtpExpiry: string };
const withCode = (handoffs: AssignedHandoff[]) => handoffs.filter((h): h is CodedHandoff => Boolean(h.pickupOtp && h.pickupOtpExpiry));

const dateFormatter = new Intl.DateTimeFormat("en-NG", { weekday: "short", month: "long", day: "numeric" });

function dateKey(item: ReadyItem): string {
  // Vendor items group by their booked delivery date; Business items (no
  // vendor booking) group by the day they were dropped off at the central
  // point — the closest equivalent "operational date" for that item.
  const raw = item.bookedFor ?? item.sellerDroppedOffAt;
  return raw ? raw.slice(0, 10) : "unscheduled";
}

export default function AdminDeliveriesPage() {
  const [readyItems, setReadyItems] = useState<ReadyItem[]>([]);
  const [deliverers, setDeliverers] = useState<DelivererRow[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedDelivererId, setSelectedDelivererId] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState("");
  const [lastHandoffs, setLastHandoffs] = useState<CodedHandoff[]>([]);

  const load = async () => {
    setLoadState("loading");
    try {
      const [itemsRes, deliverersRes] = await Promise.all([
        api.get<{ items: ReadyItem[] }>("/marketplace/admin/deliveries/ready-items"),
        api.get<{ deliverers: DelivererRow[] }>("/marketplace/admin/deliverers"),
      ]);
      setReadyItems(itemsRes.data.items);
      setDeliverers(deliverersRes.data.deliverers.filter((d) => d.status === "APPROVED"));
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

  // date -> orderId -> items, dates ascending, orders within a date in
  // creation-order (spec §9 applies here too — never re-sorted by name).
  const grouped = useMemo(() => {
    const byDate = new Map<string, Map<string, ReadyItem[]>>();
    for (const item of readyItems) {
      const dKey = dateKey(item);
      if (!byDate.has(dKey)) byDate.set(dKey, new Map());
      const byOrder = byDate.get(dKey)!;
      if (!byOrder.has(item.orderId)) byOrder.set(item.orderId, []);
      byOrder.get(item.orderId)!.push(item);
    }
    const dates = Array.from(byDate.keys()).sort();
    return dates.map((date) => ({
      date,
      orders: Array.from(byDate.get(date)!.entries())
        .map(([orderId, items]) => ({ orderId, items }))
        .sort((a, b) => a.items[0].orderCreatedAt.localeCompare(b.items[0].orderCreatedAt)),
    }));
  }, [readyItems]);

  const toggleOrder = (items: ReadyItem[]) => {
    const ids = items.map((i) => i.id);
    const allSelected = ids.every((id) => selectedItemIds.includes(id));
    setSelectedItemIds((current) =>
      allSelected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids]))
    );
  };

  const assignPlanned = async () => {
    if (selectedItemIds.length === 0) return;
    setAssigning(true);
    setMessage("");
    try {
      const res = await api.post<{ assigned: { delivererName: string; itemCount: number; handoffs: AssignedHandoff[] }[]; skipped: { orderItemId: string; reason: string }[] }>(
        "/marketplace/admin/deliveries/assign-planned",
        { orderItemIds: selectedItemIds }
      );
      const done = res.data.assigned.map((a) => `${a.itemCount} to ${a.delivererName}`).join(", ");
      const skipped = res.data.skipped.length ? ` ${res.data.skipped.length} item(s) skipped: ${Array.from(new Set(res.data.skipped.map((x) => x.reason))).join(" ")}` : "";
      setMessage(`${done ? `Assigned ${done}.` : "Nothing assigned."}${skipped}`);
      setLastHandoffs(withCode(res.data.assigned.flatMap((a) => a.handoffs)));
      setSelectedItemIds([]);
      await load();
    } catch (err) {
      setMessage((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Assignment failed.");
    } finally {
      setAssigning(false);
    }
  };

  const assign = async () => {
    if (!selectedDelivererId || selectedItemIds.length === 0) return;
    setAssigning(true);
    setMessage("");
    try {
      const res = await api.post<{ message: string; deliveryId: string; handoffs: AssignedHandoff[] }>(
        "/marketplace/admin/deliveries",
        { delivererId: selectedDelivererId, orderItemIds: selectedItemIds }
      );
      setMessage("Assigned.");
      setLastHandoffs(withCode(res.data.handoffs));
      setSelectedItemIds([]);
      await load();
    } catch (err) {
      setMessage((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Assignment failed.");
    } finally {
      setAssigning(false);
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
        <p className="text-gray-500">{loadState === "forbidden" ? "Admin access required." : "Couldn't load ready items."}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Assign deliveries</h1>
      <p className="text-sm text-gray-500 mb-6">Orders ready for a deliverer, grouped by delivery date and order.</p>

      {lastHandoffs.length > 0 && (
        <div className="mb-6 bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-2">
          <p className="text-sm font-semibold text-blue-900">Read this code to the deliverer:</p>
          {lastHandoffs.map((handoff) => (
            <p key={handoff.businessId} className="text-sm text-blue-900">
              <strong>{handoff.businessName}:</strong>{" "}
              <span className="font-mono text-base font-bold tracking-widest">
                {handoff.pickupOtp.slice(0, 3)} {handoff.pickupOtp.slice(3)}
              </span>{" "}
              <span className="text-blue-700">(valid until {new Date(handoff.pickupOtpExpiry).toLocaleString()})</span>
            </p>
          ))}
          <p className="text-xs text-blue-700">
            Didn&apos;t catch it in time? Codes stay visible on the{" "}
            <a href="/admin/deliverers/assignments" className="underline">
              Deliverer assignments
            </a>{" "}
            page too.
          </p>
        </div>
      )}

      {readyItems.length === 0 ? (
        <p className="text-sm text-gray-500">No orders waiting for assignment.</p>
      ) : (
        <>
          <div className="space-y-6 mb-6">
            {grouped.map((g) => (
              <div key={g.date}>
                <h2 className="text-sm font-semibold text-gray-900 mb-2">
                  {g.date === "unscheduled" ? "Unscheduled" : dateFormatter.format(new Date(`${g.date}T00:00:00Z`))}
                </h2>
                <div className="space-y-2">
                  {g.orders.map(({ orderId, items }) => {
                    const first = items[0];
                    const selected = items.every((i) => selectedItemIds.includes(i.id));
                    return (
                      <label
                        key={orderId}
                        className={`flex items-start gap-3 bg-white rounded-xl border p-4 cursor-pointer transition ${
                          selected ? "border-blue-300 bg-blue-50/40" : "border-gray-100"
                        }`}
                      >
                        <input type="checkbox" checked={selected} onChange={() => toggleOrder(items)} className="w-4 h-4 mt-0.5 accent-blue-600" />
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900">
                              {first.businessName}
                              {first.slot && <span className="ml-2 text-xs font-medium text-blue-600">{first.slot.label}</span>}
                            </p>
                            <span className="text-xs text-gray-500">Order #{orderId.slice(0, 8)}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">Customer: {first.customerName}</p>
                          <p className="text-xs mt-0.5">
                            {first.plannedDeliverer ? (
                              <span className={first.plannedDeliverer.approved ? "text-blue-700" : "text-red-700"}>
                                Planned: {first.plannedDeliverer.name}
                                {first.plannedDeliverer.source === "SUGGESTED" ? " (roster suggestion)" : first.plannedDeliverer.source === "MANUAL" ? " (set by admin)" : " (roster)"}
                                {!first.plannedDeliverer.approved && " — no longer approved"}
                              </span>
                            ) : (
                              <span className="text-gray-500">No deliverer planned</span>
                            )}
                          </p>
                          {first.collectionLocation && (
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                              <MapPin size={11} /> Collect at: {first.collectionLocation}
                            </p>
                          )}
                          <ul className="mt-1.5 space-y-0.5">
                            {items.map((item) => (
                              <li key={item.id} className="text-xs text-gray-600">
                                {item.quantity} x {item.productName}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-wrap items-center gap-3">
            <select
              value={selectedDelivererId}
              onChange={(e) => setSelectedDelivererId(e.target.value)}
              className="px-4 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500"
            >
              <option value="">Select a deliverer…</option>
              {deliverers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.firstName} {d.lastName}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={assigning || !selectedDelivererId || selectedItemIds.length === 0}
              onClick={assign}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-50"
            >
              {assigning ? "Assigning…" : `Assign ${selectedItemIds.length || ""} item(s)`}
            </button>
            <button
              type="button"
              disabled={assigning || selectedItemIds.length === 0}
              onClick={assignPlanned}
              className="px-5 py-2.5 rounded-xl border border-blue-600 text-blue-700 hover:bg-blue-50 text-sm font-semibold transition disabled:opacity-50"
            >
              Assign as planned
            </button>
            {message && <span className="text-sm text-gray-500">{message}</span>}
          </div>
        </>
      )}
    </div>
  );
}
