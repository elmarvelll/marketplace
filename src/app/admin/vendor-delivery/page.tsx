// src/app/admin/vendor-delivery/page.tsx
//
// Admin → Vendor Delivery — the operational dashboard for School Vendor
// deliveries: delivery-slot capacity/cutoff/prep-deadline editor, the
// deliverer ROSTER (who's on duty per timeframe/date — spec §15-19,
// completely independent of vendor order-fulfillment capacity, see
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
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Save, UserPlus, X } from "lucide-react";
import api from "@/lib/axios";
import PaginationControls from "../_components/PaginationControls";
import { formatArrivalTime, DELIVERER_ARRIVAL_LEAD_MINS } from "@/services/marketplace/vendor-delivery/deliverer-arrival";

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
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              Cutoff (min)
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

interface RosterAssignment {
  id: string;
  delivererId: string;
  delivererName: string;
  status: string;
  arrivedAt: string | null;
}

interface RosterSlotRow {
  slotId: string;
  slotLabel: string;
  windowStart: string;
  windowEnd: string;
  capacity: number;
  assignments: RosterAssignment[];
}

interface ApprovedDeliverer {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  preferredAvailability: string | null;
}

interface UpcomingNeedRow {
  date: string;
  slotId: string;
  slotLabel: string;
  windowStart: string;
  filled: number;
  capacity: number;
  needsAssignment: boolean;
}

const upcomingDateFormatter = new Intl.DateTimeFormat("en-NG", { weekday: "short", month: "short", day: "numeric" });

// Spec §16: a concrete, visible signal of which upcoming delivery dates
// still need deliverer assignments (admin must finalize these the day
// before) vs. which are already fully covered — not just a prose reminder.
function UpcomingAssignmentNeeds({ onJumpToDate }: { onJumpToDate: (date: string) => void }) {
  const [rows, setRows] = useState<UpcomingNeedRow[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");

  useEffect(() => {
    const run = async () => {
      setLoadState("loading");
      try {
        const res = await api.get<{ rows: UpcomingNeedRow[] }>("/marketplace/admin/vendor-delivery/roster/upcoming");
        setRows(res.data.rows);
        setLoadState("loaded");
      } catch {
        setLoadState("error");
      }
    };
    run();
  }, []);

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-6">
        <Loader2 size={20} className="animate-spin text-gray-500" />
      </div>
    );
  }
  if (loadState === "error") return <p className="text-sm text-gray-500 py-3">Couldn&apos;t load upcoming assignment needs.</p>;

  const byDate = new Map<string, UpcomingNeedRow[]>();
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date)!.push(row);
  }
  const dates = Array.from(byDate.keys()).sort();

  return (
    <div className="flex flex-wrap gap-2">
      {dates.map((date) => {
        const dateRows = byDate.get(date)!;
        const needsAssignment = dateRows.some((r) => r.needsAssignment);
        return (
          <button
            key={date}
            type="button"
            onClick={() => onJumpToDate(date)}
            className={`px-3 py-2 rounded-xl text-xs font-medium border transition text-left ${
              needsAssignment ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
            }`}
          >
            <p className="font-semibold">{upcomingDateFormatter.format(new Date(`${date}T00:00:00Z`))}</p>
            <p>{needsAssignment ? "Needs assignment" : "Fully assigned"}</p>
          </button>
        );
      })}
      {dates.length === 0 && <p className="text-sm text-gray-500">No active delivery slots configured.</p>}
    </div>
  );
}

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function RosterSection() {
  const [date, setDate] = useState(todayDateInputValue());
  const [roster, setRoster] = useState<RosterSlotRow[]>([]);
  const [deliverers, setDeliverers] = useState<ApprovedDeliverer[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const [assigningSlotId, setAssigningSlotId] = useState<string | null>(null);
  const [selectedDelivererId, setSelectedDelivererId] = useState<string>("");
  const [actionError, setActionError] = useState("");
  const [busyAssignmentId, setBusyAssignmentId] = useState<string | null>(null);

  const load = async (targetDate: string) => {
    setLoadState("loading");
    try {
      const [rosterRes, deliverersRes] = await Promise.all([
        api.get<{ roster: RosterSlotRow[] }>("/marketplace/admin/vendor-delivery/roster", { params: { date: targetDate } }),
        api.get<{ deliverers: ApprovedDeliverer[] }>("/marketplace/admin/deliverers"),
      ]);
      setRoster(rosterRes.data.roster);
      setDeliverers(deliverersRes.data.deliverers.filter((d) => d.status === "APPROVED"));
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  };

  useEffect(() => {
    const run = async () => {
      await load(date);
    };
    run();
  }, [date]);

  const assign = async (slotId: string) => {
    if (!selectedDelivererId) return;
    setActionError("");
    try {
      await api.post("/marketplace/admin/vendor-delivery/roster", { date, slotId, delivererId: selectedDelivererId });
      setAssigningSlotId(null);
      setSelectedDelivererId("");
      await load(date);
    } catch (err) {
      setActionError((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Couldn't assign deliverer.");
    }
  };

  const cancelAssignment = async (assignmentId: string) => {
    setBusyAssignmentId(assignmentId);
    try {
      await api.delete(`/marketplace/admin/vendor-delivery/roster/${assignmentId}`);
      await load(date);
    } finally {
      setBusyAssignmentId(null);
    }
  };

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Upcoming assignment needs</p>
      <div className="mb-4">
        <UpcomingAssignmentNeeds onJumpToDate={setDate} />
      </div>

      <div className="flex items-center gap-3 mb-3">
        <label className="text-xs text-gray-500 flex items-center gap-1.5">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-2 py-1.5 border border-gray-400 bg-white text-gray-900 rounded-lg text-sm"
          />
        </label>
      </div>

      {actionError && <div className="mb-3 text-sm p-2.5 rounded-lg text-red-700 bg-red-100">{actionError}</div>}

      {loadState === "loading" && (
        <div className="flex justify-center py-8">
          <Loader2 size={22} className="animate-spin text-gray-500" />
        </div>
      )}
      {loadState === "error" && <p className="text-sm text-gray-500 py-4">Couldn&apos;t load the roster.</p>}

      {loadState === "loaded" && (
        <div className="space-y-2">
          {roster.map((slot) => {
            const filled = slot.assignments.length;
            const available = Math.max(0, slot.capacity - filled);
            return (
              <div key={slot.slotId} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{slot.slotLabel}</p>
                    <p className="text-xs text-gray-500">
                      Arrive by {formatArrivalTime(slot.windowStart)} ({DELIVERER_ARRIVAL_LEAD_MINS} min early) · {filled}/{slot.capacity} filled ·{" "}
                      {available} open
                    </p>
                  </div>
                  {assigningSlotId === slot.slotId ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedDelivererId}
                        onChange={(e) => setSelectedDelivererId(e.target.value)}
                        className="px-2 py-1.5 border border-gray-400 bg-white text-gray-900 rounded-lg text-xs"
                      >
                        <option value="">Select deliverer…</option>
                        {deliverers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.firstName} {d.lastName}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => assign(slot.slotId)}
                        disabled={!selectedDelivererId}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
                      >
                        Assign
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssigningSlotId(null)}
                        className="text-gray-500 hover:text-gray-700 transition"
                        aria-label="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={available === 0}
                      onClick={() => setAssigningSlotId(slot.slotId)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                    >
                      <UserPlus size={13} />
                      Assign deliverer
                    </button>
                  )}
                </div>
                {slot.assignments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {slot.assignments.map((a) => (
                      <span key={a.id} className="flex items-center gap-1.5 text-xs bg-gray-50 rounded-full px-2.5 py-1">
                        {a.delivererName}
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            a.status === "NO_SHOW" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"
                          }`}
                        >
                          {a.status}
                        </span>
                        <button
                          type="button"
                          disabled={busyAssignmentId === a.id}
                          onClick={() => cancelAssignment(a.id)}
                          className="text-gray-500 hover:text-red-500 transition disabled:opacity-50"
                          aria-label={`Remove ${a.delivererName}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {roster.length === 0 && <p className="text-sm text-gray-500">No active delivery slots configured.</p>}
        </div>
      )}
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
      <div className="mb-8">
        <RosterSection />
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
