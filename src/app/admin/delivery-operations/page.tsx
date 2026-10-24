// src/app/admin/delivery-operations/page.tsx
//
// Vendor Market delivery operations — the admin's (vendor manager's) control
// center for one day: per slot, when orders close and whether the pre-slot
// briefing went out; every student delivery with its vendor orders, payment
// state, deliverer, masked code, deadline, how it was confirmed and anything
// needing attention; each deliverer's printable card and (optional)
// attendance at the meeting point; every delivery past its end-of-day
// deadline without a confirmation, across all days; and the audited
// interventions (enter the student's code for a deliverer who can't, reassign,
// reissue code, refund an item, review a legacy late confirmation, record
// attendance). Deliverers never wait on an admin: a delivery is processing
// from assignment until the student's code confirms it. The weekly roster
// itself lives in /admin/delivery-roster.
// See services/marketplace/vendor-delivery/handover/admin-operations.ts.

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { AlertTriangle, BellRing, CheckCircle2, ChevronLeft, ChevronRight, KeyRound, Loader2, MapPin, Printer, RotateCcw, UserRoundCog } from "lucide-react";
import api from "@/lib/axios";

interface OpsItem { orderItemId: string; name: string; quantity: number; deliveryStatus: string | null; refunded: boolean; deliverer: string | null }
interface OpsBooking {
  bookingId: string;
  reference: string;
  student: { name: string; email: string };
  paymentStatus: "PAID" | "AWAITING_PAYMENT" | "CANCELLED";
  deliveryLocation: string | null;
  orders: { orderId: string; vendor: string; status: string; items: OpsItem[] }[];
  deliverers: string[];
  plannedDeliverer: string | null;
  code: { masked: string; failedAttempts: number; locked: boolean; verified: boolean } | null;
  deadlineAt: string;
  holders: { id: string; name: string; open: boolean }[];
  overdue: { deadlineAt: string; flaggedAt: string; resolvedAt: string | null; resolution: string | null }[];
  confirmations: {
    id: string;
    method: "DELIVERER" | "ADMIN_FALLBACK";
    outcome: string;
    deliverer: string;
    enteredBy: string | null;
    reason: string | null;
    receivedAt: string;
    clientRecordedAt: string | null;
    late: boolean;
    clientClaimsOnTime: boolean;
  }[];
  lateSubmissions: { id: string; deliverer: string; receivedAt: string; clientRecordedAt: string | null; codeMatched: boolean }[];
  needsAttention: string[];
}
interface OpsCard {
  key: string;
  slotId: string;
  arriveBy: string;
  deliverer: { id: string; name: string; phone: string | null };
  attendance: { state: "CHECKED_IN" | "CHECKED_IN_LATE" | "NOT_RECORDED"; checkedInAt: string | null };
  pickups: { businessId: string; name: string; location: string | null; orderRefs: string[]; itemCount: number }[];
  deliveries: { bookingId: string; reference: string; studentFirstName: string; deliveryLocation: string | null; status: string; maskedCode: string | null; vendors: { name: string; items: { name: string; quantity: number }[] }[] }[];
}
interface OpsSlot {
  slot: { id: string; label: string; windowStart: string; windowEnd: string };
  summary: { confirmedBookings: number; vendorOrders: number; awaitingPayment: number; cancelledOrders: number; limit: number | null; reservedPlaces: number; closed: boolean; unassignedItems: number };
  briefingSentAt: string | null;
  ordersCloseAt: string;
  bookings: OpsBooking[];
  cards: OpsCard[];
}
interface Deliverer { id: string; firstName: string; lastName: string; status: string }
interface Overdue { id: string; bookingId: string; reference: string; date: string; slotLabel: string; student: string; deliverers: string[]; openItems: number; deadlineAt: string; flaggedAt: string }

const newSubmissionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

// The admin fallback: enter the student's code a deliverer passed on because
// they couldn't submit it. Checked by the server exactly like the deliverer's
// own entry; a reason is required and the entry is audited.
function AdminCodeEntry({ booking, busy, onSubmit }: { booking: OpsBooking; busy: boolean; onSubmit: (input: { code: string; reason: string; delivererId?: string }) => void }) {
  const open = booking.holders.filter((h) => h.open);
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [delivererId, setDelivererId] = useState(open.length === 1 ? open[0].id : "");
  const digits = code.replace(/\D/g, "");
  const ready = digits.length === 6 && reason.trim() !== "" && (open.length <= 1 || delivererId !== "");
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-purple-200 bg-white p-2 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit({ code: digits, reason: reason.trim(), delivererId: delivererId || undefined });
      }}
    >
      <label className="text-gray-600">
        Student&apos;s code
        <input inputMode="numeric" autoComplete="off" maxLength={7} value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))} placeholder="6 digits" className="mt-0.5 block w-28 px-2 py-1 border border-gray-400 rounded-lg font-mono tracking-widest text-gray-900 bg-white" />
      </label>
      {open.length > 1 && (
        <label className="text-gray-600">
          For deliverer
          <select value={delivererId} onChange={(e) => setDelivererId(e.target.value)} className="mt-0.5 block px-2 py-1 border border-gray-300 rounded-lg bg-white text-gray-900">
            <option value="">Choose…</option>
            {open.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
      )}
      <label className="flex-1 min-w-[12rem] text-gray-600">
        Why is an admin entering it? (required)
        <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Deliverer's phone died; read the code to me by call" className="mt-0.5 block w-full px-2 py-1 border border-gray-400 rounded-lg bg-white text-gray-900" />
      </label>
      <button type="submit" disabled={!ready || busy} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold disabled:opacity-50">Check code</button>
    </form>
  );
}

// Where deliverers meet before a slot. One place for now (male deliverers
// only) — this will need splitting when female deliverers join.
function MeetingPoint() {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");

  useEffect(() => {
    const run = async () => {
      try {
        const res = await api.get<{ location: string | null }>("/marketplace/admin/delivery-operations/meeting-point");
        setSaved(res.data.location);
        setDraft(res.data.location ?? "");
        setState("idle");
      } catch {
        setState("error");
      }
    };
    run();
  }, []);

  const save = async () => {
    setState("saving");
    try {
      const res = await api.put<{ location: string | null }>("/marketplace/admin/delivery-operations/meeting-point", { location: draft });
      setSaved(res.data.location);
      setState("saved");
    } catch {
      setState("error");
    }
  };

  return (
    <form
      className="ops-screen mb-6 flex flex-wrap items-end gap-2 bg-white rounded-2xl border border-gray-100 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="flex-1 min-w-[16rem] text-xs text-gray-600">
        <span className="flex items-center gap-1 font-medium text-gray-900 text-sm mb-1"><MapPin size={14} /> Deliverer meeting point</span>
        Deliverers meet here before each slot. Recording their arrival is optional — it never blocks a delivery.
        <input
          value={draft}
          maxLength={200}
          disabled={state === "loading" || state === "saving"}
          onChange={(e) => {
            setDraft(e.target.value);
            if (state === "saved") setState("idle");
          }}
          placeholder="e.g. Marketplace office, Student Union Building, ground floor"
          className="mt-1 block w-full px-3 py-2 border border-gray-400 rounded-lg text-sm bg-white text-gray-900"
        />
      </label>
      <button type="submit" disabled={state === "loading" || state === "saving" || draft.trim() === (saved ?? "")} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50">
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save"}
      </button>
      {!saved && state !== "loading" && <p className="w-full text-xs text-amber-700">No meeting point set — deliverers are told to report to &ldquo;the meeting point&rdquo;.</p>}
      {state === "error" && <p className="w-full text-xs text-red-700">Couldn&apos;t load or save the meeting point.</p>}
    </form>
  );
}

const time = new Intl.DateTimeFormat("en-NG", { timeStyle: "short", timeZone: "Africa/Lagos" });
const dateTime = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });
const longDay = new Intl.DateTimeFormat("en-NG", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const lagosToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
const shiftDay = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const label = (s: string | null) => (s ? s.replace(/_/g, " ").toLowerCase() : "not assigned");

export default function DeliveryOperationsPage() {
  const [date, setDate] = useState<string>(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("date")) || lagosToday());
  const [slots, setSlots] = useState<OpsSlot[]>([]);
  const [deliverers, setDeliverers] = useState<Deliverer[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [printKey, setPrintKey] = useState<string | null>(null);
  const [overdue, setOverdue] = useState<Overdue[]>([]);
  const [codeEntry, setCodeEntry] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoadState("loading");
    try {
      const [res, overdueRes] = await Promise.all([
        api.get<{ slots: OpsSlot[] }>("/marketplace/admin/delivery-operations", { params: { date } }),
        api.get<{ overdue: Overdue[] }>("/marketplace/admin/delivery-operations/overdue"),
      ]);
      setSlots(res.data.slots);
      setOverdue(overdueRes.data.overdue);
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  }, [date]);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
    window.history.replaceState(null, "", `?date=${date}`);
  }, [load, date]);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await api.get<{ deliverers: Deliverer[] }>("/marketplace/admin/deliverers");
        setDeliverers(res.data.deliverers.filter((d) => d.status === "APPROVED"));
      } catch {
        setDeliverers([]);
      }
    };
    run();
  }, []);

  const act = async (key: string, action: () => Promise<unknown>, success: string | ((result: unknown) => { tone: "ok" | "bad"; text: string })) => {
    setBusy(key);
    setNotice(null);
    try {
      const result = await action();
      setNotice(typeof success === "string" ? { tone: "ok", text: success } : success(result));
      await load(true);
    } catch (err) {
      setNotice({ tone: "bad", text: (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "That action failed." });
    } finally {
      setBusy(null);
    }
  };
  const askReason = (question: string) => window.prompt(question)?.trim() || null;

  const reassign = (b: OpsBooking, delivererId: string) => {
    const reason = askReason(`Why is #${b.reference} being (re)assigned?`);
    if (reason) void act(b.bookingId, () => api.post(`/marketplace/admin/delivery-operations/bookings/${b.bookingId}/reassign`, { delivererId, reason }), "Delivery assigned.");
  };
  const reissue = (b: OpsBooking) => {
    const reason = askReason(`Reason for issuing ${b.student.name} a new delivery code? The old one will stop working.`);
    if (reason) void act(b.bookingId, () => api.post(`/marketplace/admin/delivery-operations/bookings/${b.bookingId}/reissue-code`, { reason }), "New code sent to the student.");
  };
  const refund = (orderId: string, item: OpsItem) => {
    const reason = askReason(`Refund ${item.quantity} x ${item.name}? Give the reason the student will see.`);
    if (reason) void act(item.orderItemId, () => api.post(`/marketplace/admin/vendor-delivery/orders/${orderId}/items/${item.orderItemId}/refund`, { reason }), "Item refunded.");
  };
  const enterCode = (b: OpsBooking, input: { code: string; reason: string; delivererId?: string }) =>
    void act(
      b.bookingId,
      async () => (await api.post(`/marketplace/admin/delivery-operations/bookings/${b.bookingId}/confirm-code`, { ...input, submissionId: newSubmissionId() })).data,
      (result) => {
        const r = result as { outcome: string; late?: boolean; alreadyDelivered?: boolean; attemptsLeft?: number; reason?: string };
        if (r.outcome === "VERIFIED") {
          setCodeEntry(null);
          return { tone: "ok", text: r.alreadyDelivered ? `#${b.reference} was already confirmed.` : `Code correct — #${b.reference} delivered${r.late ? " (recorded as late)" : ""}. Recorded as entered by you.` };
        }
        return { tone: "bad", text: r.reason === "locked" ? "The code is locked after too many wrong attempts — issue a new code." : `Wrong code — not delivered. ${r.attemptsLeft ?? 0} attempt(s) left.` };
      }
    );
  const review = (submissionId: string, decision: "COMPLETED" | "DECLINED") => {
    const note = askReason(decision === "COMPLETED" ? "Why accept this late confirmation as delivered?" : "Why decline it?");
    if (note) void act(submissionId, () => api.post(`/marketplace/admin/delivery-operations/late-submissions/${submissionId}/review`, { decision, note }), "Review recorded.");
  };
  const checkIn = (slotId: string, card: OpsCard) =>
    void act(card.key, () => api.post("/marketplace/admin/delivery-operations/check-in", { date, slotId, delivererId: card.deliverer.id }), `${card.deliverer.name}'s arrival recorded.`);

  return (
    <div className={printKey ? "ops-printing" : undefined}>
      <style>{`@media print { .ops-printing .ops-screen { display: none !important; } .ops-printing .ops-card:not(.ops-print-target) { display: none !important; } }`}</style>
      <div className="ops-screen flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Delivery operations</h1>
          <p className="text-sm text-gray-500">Vendor Market deliveries for one day. Each delivery is processing from assignment until the deliverer enters the student&apos;s code — no pickup or check-in step. Edit who works which slot in the <Link href="/admin/delivery-roster" className="text-blue-600 hover:underline">delivery roster</Link>.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Previous day" onClick={() => setDate((d) => shiftDay(d, -1))} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"><ChevronLeft size={16} /></button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900" />
          <button type="button" aria-label="Next day" onClick={() => setDate((d) => shiftDay(d, 1))} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"><ChevronRight size={16} /></button>
          <button type="button" onClick={() => setDate(lagosToday())} className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100">Today</button>
        </div>
      </div>

      <MeetingPoint />

      {overdue.length > 0 && (
        <section className="ops-screen mb-6 rounded-2xl border border-red-200 bg-red-50/50 p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-red-800"><AlertTriangle size={15} /> Not confirmed by the end of the delivery day ({overdue.length})</h2>
          <p className="text-xs text-red-800/80 mb-2">Missing confirmation isn&apos;t proof it wasn&apos;t delivered: nothing is cancelled or refunded automatically. The deliverer can still enter the student&apos;s code, or you can enter it for them.</p>
          <ul className="space-y-1 text-xs text-gray-800">
            {overdue.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  #{o.reference} · {o.student} · {o.slotLabel}, {longDay.format(new Date(`${o.date}T00:00:00Z`))} · deliverer: {o.deliverers.join(", ") || "none"} · {o.openItems} item(s) processing · deadline {dateTime.format(new Date(o.deadlineAt))}
                </span>
                {o.date !== date && <button type="button" onClick={() => setDate(o.date)} className="font-semibold text-red-700 hover:underline">Open day</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {notice && (
        <div role="status" className={`ops-screen mb-4 text-sm p-3 rounded-lg ${notice.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-100 text-red-700"}`}>{notice.text}</div>
      )}

      {loadState === "loading" && <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-500" /></div>}
      {loadState === "error" && <p className="text-sm text-gray-500 py-8">Couldn&apos;t load delivery operations.</p>}
      {loadState === "loaded" && slots.length === 0 && (
        <p className="text-sm text-gray-500 py-8 text-center bg-white rounded-2xl border border-gray-100">No Vendor Market deliveries on {longDay.format(new Date(`${date}T00:00:00Z`))}.</p>
      )}

      <div className="space-y-8">
        {loadState === "loaded" && slots.map((s) => (
          <section key={s.slot.id} className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-6">
            <header className="ops-screen flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold text-gray-900">{s.slot.label}</h2>
                <p className="text-xs text-gray-500">
                  Orders closed at {time.format(new Date(s.ordersCloseAt))} ·{" "}
                  <span className="inline-flex items-center gap-1"><BellRing size={11} />{s.briefingSentAt ? `briefing sent ${time.format(new Date(s.briefingSentAt))}` : "briefing not sent yet"}</span>
                </p>
              </div>
              <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
                <div><dt className="inline">Deliveries </dt><dd className="inline font-semibold text-gray-900">{s.summary.confirmedBookings}</dd></div>
                <div><dt className="inline">Vendor orders </dt><dd className="inline font-semibold text-gray-900">{s.summary.vendorOrders}</dd></div>
                <div><dt className="inline">Limit </dt><dd className="inline font-semibold text-gray-900">{s.summary.closed ? "closed" : s.summary.limit === null ? "none" : `${s.summary.reservedPlaces}/${s.summary.limit}`}</dd></div>
                {s.summary.awaitingPayment > 0 && <div><dt className="inline">Awaiting payment </dt><dd className="inline font-semibold text-gray-900">{s.summary.awaitingPayment}</dd></div>}
                {s.summary.unassignedItems > 0 && <div className="text-amber-700"><dt className="inline">Unassigned items </dt><dd className="inline font-semibold">{s.summary.unassignedItems}</dd></div>}
              </dl>
            </header>

            <div className="ops-screen space-y-3">
              {s.bookings.map((b) => (
                <div key={b.bookingId} className={`rounded-xl border p-3 ${b.needsAttention.length > 0 ? "border-amber-200 bg-amber-50/40" : "border-gray-100"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">#{b.reference} · {b.student.name} <span className="font-normal text-gray-500">({b.student.email})</span></p>
                      <p className="text-xs text-gray-600">{b.deliveryLocation || "No delivery location"} · {b.paymentStatus === "PAID" ? "Paid" : "Awaiting payment — not part of the delivery yet"}</p>
                      <p className="text-xs text-gray-500">
                        Deliverer: {b.deliverers.length > 0 ? b.deliverers.join(", ") : b.plannedDeliverer ? `planned ${b.plannedDeliverer} (not assigned yet)` : "none"}
                        {b.code && <> · code <span className="font-mono tracking-widest">{b.code.masked}</span>{b.code.verified ? " (used)" : b.code.failedAttempts > 0 ? ` (${b.code.failedAttempts} wrong)` : ""}</>}
                        {" · "}confirm by {dateTime.format(new Date(b.deadlineAt))}
                      </p>
                    </div>
                    {b.paymentStatus === "PAID" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1 text-xs text-gray-600">
                          <UserRoundCog size={13} />
                          <select
                            aria-label={`Assign #${b.reference} to`}
                            disabled={busy === b.bookingId}
                            value=""
                            onChange={(e) => e.target.value && reassign(b, e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded-lg text-xs bg-white text-gray-900"
                          >
                            <option value="">{b.deliverers.length > 0 ? "Reassign…" : "Assign…"}</option>
                            {deliverers.map((d) => <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>)}
                          </select>
                        </label>
                        {b.code && !b.code.verified && (
                          <button type="button" disabled={busy === b.bookingId} onClick={() => reissue(b)} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 hover:text-gray-900 disabled:opacity-50">
                            <RotateCcw size={12} /> New code
                          </button>
                        )}
                        {b.holders.some((h) => h.open) && (
                          <button type="button" onClick={() => setCodeEntry(codeEntry === b.bookingId ? null : b.bookingId)} className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-900">
                            <KeyRound size={12} /> Enter student&apos;s code
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <ul className="mt-2 space-y-1">
                    {b.orders.map((o) => o.items.map((item) => (
                      <li key={item.orderItemId} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-gray-700">{o.vendor}: {item.quantity} x {item.name}</span>
                        <span className="flex items-center gap-2 text-gray-500">
                          {item.refunded ? "refunded" : label(item.deliveryStatus)}
                          {!item.refunded && item.deliveryStatus !== "DELIVERED" && b.paymentStatus === "PAID" && (
                            <button type="button" disabled={busy === item.orderItemId} onClick={() => refund(o.orderId, item)} className="text-red-600 hover:underline disabled:opacity-50">Refund</button>
                          )}
                        </span>
                      </li>
                    )))}
                  </ul>

                  {codeEntry === b.bookingId && <AdminCodeEntry booking={b} busy={busy === b.bookingId} onSubmit={(input) => enterCode(b, input)} />}

                  {b.needsAttention.length > 0 && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800"><AlertTriangle size={13} className="mt-px shrink-0" />{b.needsAttention.join(" · ")}</p>
                  )}
                  {(b.confirmations.length > 0 || b.overdue.length > 0) && (
                    <ul className="mt-2 space-y-0.5 text-xs text-gray-600">
                      {b.overdue.map((o) => (
                        <li key={o.flaggedAt}>
                          <AlertTriangle size={11} className="inline mr-1 text-red-600" />
                          Not confirmed by {dateTime.format(new Date(o.deadlineAt))} — flagged {dateTime.format(new Date(o.flaggedAt))}
                          {o.resolvedAt ? ` · resolved ${dateTime.format(new Date(o.resolvedAt))} (${o.resolution === "DELIVERED" ? "delivered late" : "cancelled"})` : " · open"}
                        </li>
                      ))}
                      {b.confirmations.map((c) => (
                        <li key={c.id}>
                          {c.outcome === "VERIFIED" ? <CheckCircle2 size={11} className="inline mr-1 text-green-700" /> : <AlertTriangle size={11} className="inline mr-1 text-amber-700" />}
                          {c.method === "ADMIN_FALLBACK" ? `Code entered by admin ${c.enteredBy ?? ""} for ${c.deliverer}` : `Code entered by ${c.deliverer}`}
                          {" · "}{c.outcome === "VERIFIED" ? "correct" : c.outcome === "REJECTED" ? "wrong" : c.outcome.toLowerCase()} · {dateTime.format(new Date(c.receivedAt))}
                          {c.late && " · late"}
                          {c.reason && ` · reason: ${c.reason}`}
                          {c.clientClaimsOnTime && c.clientRecordedAt && (
                            <span className="text-amber-700"> · phone recorded it {dateTime.format(new Date(c.clientRecordedAt))}, before the deadline (unverified — likely offline)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {b.lateSubmissions.map((l) => (
                    <div key={l.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-amber-200 p-2 text-xs">
                      <span className="text-gray-700">
                        Late confirmation by {l.deliverer}: reached the server {dateTime.format(new Date(l.receivedAt))}
                        {l.clientRecordedAt && ` (phone says entered ${dateTime.format(new Date(l.clientRecordedAt))} — unverified)`} · code {l.codeMatched ? "correct" : "wrong"}
                      </span>
                      <span className="flex gap-2">
                        {l.codeMatched && <button type="button" disabled={busy === l.id} onClick={() => review(l.id, "COMPLETED")} className="font-semibold text-green-700 hover:underline disabled:opacity-50">Accept as delivered</button>}
                        <button type="button" disabled={busy === l.id} onClick={() => review(l.id, "DECLINED")} className="font-semibold text-gray-600 hover:underline disabled:opacity-50">Decline</button>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {s.cards.length > 0 && (
              <div className="mt-6">
                <h3 className="ops-screen text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Delivery cards</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {s.cards.map((card) => (
                    <article key={card.key} className={`ops-card rounded-xl border border-gray-200 p-3 ${printKey === card.key ? "ops-print-target" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {card.deliverer.name}
                            {card.deliverer.phone && <span className="font-normal text-gray-500"> · {card.deliverer.phone}</span>}
                          </p>
                          <p className="text-xs text-gray-500">{longDay.format(new Date(`${date}T00:00:00Z`))} · {s.slot.label} · arrive by {card.arriveBy}</p>
                        </div>
                        <div className="ops-screen flex items-center gap-2">
                          <button type="button" onClick={() => { setPrintKey(card.key); setTimeout(() => { window.print(); setPrintKey(null); }, 50); }} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 hover:text-gray-900"><Printer size={12} /> Print</button>
                          {card.attendance.checkedInAt ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-700">
                              <CheckCircle2 size={12} /> Arrived {time.format(new Date(card.attendance.checkedInAt))}{card.attendance.state === "CHECKED_IN_LATE" && " (after the slot)"}
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={busy === card.key}
                              onClick={() => checkIn(s.slot.id, card)}
                              title="Optional attendance record — the deliverer doesn't need it to deliver"
                              className="px-2.5 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold disabled:opacity-50"
                            >
                              Record arrival
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs font-medium text-gray-700">Collect from</p>
                      <ul className="mb-2 text-xs text-gray-600">
                        {card.pickups.map((p) => <li key={p.businessId}>{p.name} — {p.location || "no location"} · {p.itemCount} item(s)</li>)}
                      </ul>
                      <p className="text-xs font-medium text-gray-700">Deliveries</p>
                      <ul className="text-xs text-gray-600 space-y-1">
                        {card.deliveries.map((d) => (
                          <li key={d.bookingId}>
                            #{d.reference} {d.studentFirstName} — {d.deliveryLocation || "no location"} · <span className="font-mono tracking-widest">{d.maskedCode ?? "------"}</span> · {label(d.status)}
                            <br />
                            <span className="text-gray-500">{d.vendors.map((v) => `${v.name}: ${v.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}`).join(" | ")}</span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
