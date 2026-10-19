// src/app/admin/vendor-delivery/page.tsx
//
// Admin → Vendor Delivery — the operational dashboard for School Vendor
// deliveries: delivery-slot capacity/cutoff/prep-deadline editor, the
// pointer to the recurring Delivery Roster (who's on duty per timeframe and
// the delivery limit — Admin -> Delivery Roster, independent of vendor
// order-fulfillment capacity, see
// docs/marketplace/decisions/vendor-independent-architecture.md), and a
// filterable list of vendor bookings/orders/buyers/fees. Actual pickup
// assignment for ready orders reuses the existing Deliverers →
// Assignments flow unchanged (assign-delivery.ts already handles vendor
// OrderItems); central drop-off location + vendor fee configuration is on
// the existing Settings tab.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { AlertCircle, CalendarDays, CheckCircle2, ExternalLink, Loader2, Save } from "lucide-react";
import api from "@/lib/axios";
import PaginationControls from "../_components/PaginationControls";

interface VendorSlot {
  id: string;
  label: string;
  windowStart: string;
  windowEnd: string;
  bookingCutoffMins: number;
  vendorPrepDeadlineMins: number;
  delivererCapacity: number;
  active: boolean;
}

interface VendorBookingOrder {
  id: string;
  businessName: string;
  status: string;
  fulfillmentStatus: string | null;
  deliveryOutcome: string;
  totalAmount: number;
  isDisputed: boolean;
  itemCount: number;
}

interface VendorBookingRow {
  id: string;
  status: string;
  bookedFor: string;
  deliveryFee: number;
  serviceFee: number;
  createdAt: string;
  slot: { id: string; label: string };
  buyerEmail: string;
  orders: VendorBookingOrder[];
}

interface BookingPage {
  items: VendorBookingRow[];
  page: number;
  totalPages: number;
  total: number;
}

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" });

type EditableSlotFields = Pick<VendorSlot, "delivererCapacity" | "bookingCutoffMins" | "vendorPrepDeadlineMins">;

function SlotCapacityEditor() {
  const [slots, setSlots] = useState<VendorSlot[]>([]);
  const [draft, setDraft] = useState<Record<string, EditableSlotFields>>({});
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  // Per-row save/toggle state — never one request per keystroke (spec §3
  // applies to "any similar capacity-editing interface", not just the
  // vendor's own editor).
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = async () => {
    setLoadState("loading");
    try {
      const res = await api.get<{ slots: VendorSlot[] }>("/marketplace/admin/vendor-delivery/slots");
      setSlots(res.data.slots);
      setDraft(
        Object.fromEntries(
          res.data.slots.map((s) => [
            s.id,
            { delivererCapacity: s.delivererCapacity, bookingCutoffMins: s.bookingCutoffMins, vendorPrepDeadlineMins: s.vendorPrepDeadlineMins },
          ])
        )
      );
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
  }, []);

  const save = async (slot: VendorSlot, patch: Partial<VendorSlot>) => {
    if (savingId === slot.id) return; // guards against double-submit
    setSavingId(slot.id);
    try {
      const res = await api.patch<{ slot: VendorSlot }>(`/marketplace/admin/vendor-delivery/slots/${slot.id}`, patch);
      setSlots((current) => current.map((s) => (s.id === slot.id ? res.data.slot : s)));
      setDraft((d) => ({
        ...d,
        [slot.id]: {
          delivererCapacity: res.data.slot.delivererCapacity,
          bookingCutoffMins: res.data.slot.bookingCutoffMins,
          vendorPrepDeadlineMins: res.data.slot.vendorPrepDeadlineMins,
        },
      }));
      setSavedId(slot.id);
      setTimeout(() => setSavedId((current) => (current === slot.id ? null : current)), 1500);
    } finally {
      setSavingId(null);
    }
  };

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={22} className="animate-spin text-gray-500" />
      </div>
    );
  }
  if (loadState === "error") {
    return <p className="text-sm text-gray-500 py-4">Couldn&apos;t load delivery slots.</p>;
  }

  return (
    <div className="space-y-2">
      {slots.map((slot) => {
        const values = draft[slot.id] ?? {
          delivererCapacity: slot.delivererCapacity,
          bookingCutoffMins: slot.bookingCutoffMins,
          vendorPrepDeadlineMins: slot.vendorPrepDeadlineMins,
        };
        const dirty =
          values.delivererCapacity !== slot.delivererCapacity ||
          values.bookingCutoffMins !== slot.bookingCutoffMins ||
          values.vendorPrepDeadlineMins !== slot.vendorPrepDeadlineMins;
        const saving = savingId === slot.id;
        return (
          <div key={slot.id} className="flex flex-wrap items-center gap-3 bg-white rounded-2xl border border-gray-100 p-4">
            <div className="min-w-[140px]">
              <p className="font-medium text-gray-900 text-sm">{slot.label}</p>
              <p className="text-xs text-gray-500">
                {slot.windowStart} – {slot.windowEnd}
              </p>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              Capacity
              <input
                type="number"
                min={0}
                value={values.delivererCapacity}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [slot.id]: { ...values, delivererCapacity: Math.max(0, Math.trunc(Number(e.target.value) || 0)) } }))
                }
                className="w-16 px-2 py-1 border border-gray-400 bg-white rounded-lg text-xs text-gray-900"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500" title="Orders close at least 120 minutes before the slot starts; a smaller number here has no effect.">
              Cutoff (min, ≥120)
              <input
                type="number"
                min={0}
                value={values.bookingCutoffMins}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [slot.id]: { ...values, bookingCutoffMins: Math.max(0, Math.trunc(Number(e.target.value) || 0)) } }))
                }
                className="w-16 px-2 py-1 border border-gray-400 bg-white rounded-lg text-xs text-gray-900"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              Prep deadline (min)
              <input
                type="number"
                min={0}
                value={values.vendorPrepDeadlineMins}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [slot.id]: { ...values, vendorPrepDeadlineMins: Math.max(0, Math.trunc(Number(e.target.value) || 0)) } }))
                }
                className="w-16 px-2 py-1 border border-gray-400 bg-white rounded-lg text-xs text-gray-900"
              />
            </label>
            {dirty && (
              <button
                type="button"
                disabled={saving}
                onClick={() => save(slot, values)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {saving ? "Saving…" : "Save"}
              </button>
            )}
            {!dirty && savedId === slot.id && (
              <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                <CheckCircle2 size={12} /> Saved
              </span>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => save(slot, { active: !slot.active })}
              className={`ml-auto text-xs font-medium px-3 py-1.5 rounded-full transition disabled:opacity-50 ${
                slot.active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              {slot.active ? "Active" : "Inactive"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "PENDING_PAYMENT", label: "Pending payment" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "CANCELLED", label: "Cancelled" },
];

export default function AdminVendorDeliveryPage() {
  const [result, setResult] = useState<BookingPage | null>(null);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");

  const load = async (targetPage: number, targetStatus: string) => {
    setLoadState("loading");
    try {
      const res = await api.get<BookingPage>("/marketplace/admin/vendor-delivery/bookings", {
        params: { page: targetPage, status: targetStatus || undefined },
      });
      setResult(res.data);
      setLoadState("loaded");
    } catch (err) {
      setLoadState(isAxiosError(err) && err.response?.status === 403 ? "forbidden" : "error");
    }
  };

  useEffect(() => {
    const run = async () => {
      await load(page, status);
    };
    run();
  }, [page, status]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Vendor Delivery</h1>
      <p className="text-sm text-gray-500 mb-6">
        Delivery-slot capacity (deliverer positions — separate from each vendor&apos;s own order-fulfillment
        capacity), the deliverer roster, and every School Vendor booking. Once a vendor marks an order ready,
        assign the pickup itself from{" "}
        <Link href="/admin/deliverers/assignments" className="text-blue-600 hover:underline inline-flex items-center gap-1">
          Deliverers → Assignments <ExternalLink size={12} />
        </Link>
        ; vendor fees are on{" "}
        <Link href="/admin/settings" className="text-blue-600 hover:underline inline-flex items-center gap-1">
          Settings <ExternalLink size={12} />
        </Link>
        .
      </p>

      <h2 className="font-semibold text-gray-900 mb-3">Delivery slots (deliverer positions)</h2>
      <div className="mb-8">
        <SlotCapacityEditor />
      </div>

      <h2 className="font-semibold text-gray-900 mb-3">Deliverer roster</h2>
      <div className="mb-8 bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Who works each timeframe, every week, and the maximum deliveries per timeframe now live in the recurring Delivery Roster. One-off
          changes for a single date are made in its date view; date-only assignments made here before still count.
        </p>
        <Link
          href="/admin/delivery-roster"
          className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition"
        >
          <CalendarDays size={14} /> Open Delivery Roster
        </Link>
      </div>

      <h2 className="font-semibold text-gray-900 mb-3">Bookings</h2>
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setStatus(f.key);
              setPage(1);
            }}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition ${
              status === f.key ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loadState === "forbidden" || loadState === "error" ? (
        <div className="flex flex-col items-center text-center py-24 px-4">
          <AlertCircle size={28} className="text-gray-500 mb-3" />
          <p className="text-gray-500">{loadState === "forbidden" ? "Admin access required." : "Couldn't load bookings."}</p>
        </div>
      ) : loadState === "loading" ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-500" />
        </div>
      ) : result && result.items.length === 0 ? (
        <p className="text-sm text-gray-500">No vendor bookings yet.</p>
      ) : (
        result && (
          <>
            <div className="space-y-3">
              {result.items.map((booking) => (
                <div key={booking.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">
                        {booking.slot.label} · {dateFormatter.format(new Date(booking.bookedFor))}
                      </p>
                      <p className="text-xs text-gray-500">{booking.buyerEmail}</p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        booking.status === "CONFIRMED"
                          ? "bg-green-50 text-green-700"
                          : booking.status === "CANCELLED"
                            ? "bg-red-50 text-red-600"
                            : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {booking.status}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {booking.orders.map((order) => (
                      <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 border-t border-gray-50 pt-1.5">
                        <span>
                          {order.businessName} · {order.itemCount} item(s) · {order.status} / {order.fulfillmentStatus ?? "—"} / {order.deliveryOutcome}
                          {order.isDisputed && <span className="ml-1.5 text-red-600 font-medium">Disputed</span>}
                        </span>
                        <span className="font-medium text-gray-900">₦{nairaFormatter.format(order.totalAmount)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                      <span>Delivery fee ₦{nairaFormatter.format(booking.deliveryFee)} · Service fee ₦{nairaFormatter.format(booking.serviceFee)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <PaginationControls page={result.page} totalPages={result.totalPages} total={result.total} onPageChange={setPage} />
          </>
        )
      )}
    </div>
  );
}
