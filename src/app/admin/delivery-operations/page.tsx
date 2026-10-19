// src/app/admin/delivery-operations/page.tsx
//
// Vendor Market delivery operations — the admin's (vendor manager's) control
// center for one day: per slot, when orders close and whether the pre-slot
// briefing went out; every student delivery with its vendor orders, payment
// state, deliverer, masked code, deadline and anything needing attention;
// each deliverer's shift (Scheduled -> In progress once checked in at the
// meeting point -> Delivered, or Missed) and printable card; the meeting
// point itself; and the audited interventions (check in / unlock a missed
// shift, reassign, reissue code, refund an item, review a late confirmation). The weekly roster itself lives in /admin/delivery-roster.
// See services/marketplace/vendor-delivery/handover/admin-operations.ts.

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { AlertTriangle, BellRing, CheckCircle2, ChevronLeft, ChevronRight, Loader2, MapPin, Printer, RotateCcw, UserRoundCog } from "lucide-react";
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
  lateSubmissions: { id: string; deliverer: string; receivedAt: string; clientRecordedAt: string | null; codeMatched: boolean }[];
  needsAttention: string[];
}
interface OpsCard {
  key: string;
  slotId: string;
  arriveBy: string;
  deliverer: { id: string; name: string; phone: string | null };
  shift: { state: ShiftState; unlocked: boolean; checkedInAt: string | null; late: boolean; endsAt: string };
  pickups: { businessId: string; name: string; location: string | null; orderRefs: string[]; itemCount: number; collected: boolean }[];
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
type ShiftState = "SCHEDULED" | "IN_PROGRESS" | "DELIVERED" | "MISSED";

const SHIFT_BADGE: Record<ShiftState, { text: string; className: string }> = {
  SCHEDULED: { text: "Scheduled", className: "bg-gray-100 text-gray-700" },
  IN_PROGRESS: { text: "In progress", className: "bg-blue-50 text-blue-700" },
  DELIVERED: { text: "Delivered", className: "bg-green-50 text-green-700" },
  MISSED: { text: "Missed", className: "bg-red-50 text-red-700" },
};

// Where deliverers report to be checked in. One place for now (male
// deliverers only) — this will need splitting when female deliverers join.
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
        Deliverers report here before each shift to be checked in.
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

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoadState("loading");
    try {
      const res = await api.get<{ slots: OpsSlot[] }>("/marketplace/admin/delivery-operations", { params: { date } });
      setSlots(res.data.slots);
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

  const act = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: "ok", text: success });
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
  const review = (submissionId: string, decision: "COMPLETED" | "DECLINED") => {
    const note = askReason(decision === "COMPLETED" ? "Why accept this late confirmation as delivered?" : "Why decline it?");
    if (note) void act(submissionId, () => api.post(`/marketplace/admin/delivery-operations/late-submissions/${submissionId}/review`, { decision, note }), "Review recorded.");
  };
  const checkIn = (slotId: string, card: OpsCard) => {
    const missed = card.shift.state === "MISSED";
    const note = missed ? askReason(`${card.deliverer.name} missed this shift. Why let them finish these deliveries anyway? It stays counted as missed.`) : "";
    if (missed && !note) return;
    void act(
      card.key,
      () => api.post("/marketplace/admin/delivery-operations/check-in", { date, slotId, delivererId: card.deliverer.id, note }),
      missed ? `${card.deliverer.name}'s missed shift unlocked.` : `${card.deliverer.name} checked in — shift in progress.`
    );
  };

  return (
    <div className={printKey ? "ops-printing" : undefined}>
      <style>{`@media print { .ops-printing .ops-screen { display: none !important; } .ops-printing .ops-card:not(.ops-print-target) { display: none !important; } }`}</style>
      <div className="ops-screen flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Delivery operations</h1>
          <p className="text-sm text-gray-500">Vendor Market deliveries for one day. Check deliverers in when they arrive at the meeting point — until then they can&apos;t collect or deliver. Edit who works which slot in the <Link href="/admin/delivery-roster" className="text-blue-600 hover:underline">delivery roster</Link>.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Previous day" onClick={() => setDate((d) => shiftDay(d, -1))} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"><ChevronLeft size={16} /></button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900" />
          <button type="button" aria-label="Next day" onClick={() => setDate((d) => shiftDay(d, 1))} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"><ChevronRight size={16} /></button>
          <button type="button" onClick={() => setDate(lagosToday())} className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100">Today</button>
        </div>
      </div>

      <MeetingPoint />

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

                  {b.needsAttention.length > 0 && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800"><AlertTriangle size={13} className="mt-px shrink-0" />{b.needsAttention.join(" · ")}</p>
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
                            {card.deliverer.phone && <span className="font-normal text-gray-500"> · {card.deliverer.phone}</span>}{" "}
                            <span className={`ml-1 align-middle text-[11px] font-semibold px-2 py-0.5 rounded-full ${SHIFT_BADGE[card.shift.state].className}`}>{SHIFT_BADGE[card.shift.state].text}</span>
                          </p>
                          <p className="text-xs text-gray-500">{longDay.format(new Date(`${date}T00:00:00Z`))} · {s.slot.label} · arrive by {card.arriveBy}</p>
                        </div>
                        <div className="ops-screen flex items-center gap-2">
                          <button type="button" onClick={() => { setPrintKey(card.key); setTimeout(() => { window.print(); setPrintKey(null); }, 50); }} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 hover:text-gray-900"><Printer size={12} /> Print</button>
                          {card.shift.checkedInAt ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-700">
                              <CheckCircle2 size={12} /> {card.shift.late ? "Unlocked late" : "Checked in"} {time.format(new Date(card.shift.checkedInAt))}
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={busy === card.key}
                              onClick={() => checkIn(s.slot.id, card)}
                              className={`px-2.5 py-1 rounded-lg text-white text-xs font-semibold disabled:opacity-50 ${card.shift.state === "MISSED" ? "bg-gray-700 hover:bg-gray-800" : "bg-purple-600 hover:bg-purple-700"}`}
                            >
                              {card.shift.state === "MISSED" ? "Unlock missed shift" : "Checked in — start shift"}
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs font-medium text-gray-700">Pickups</p>
                      <ul className="mb-2 text-xs text-gray-600">
                        {card.pickups.map((p) => <li key={p.businessId}>{p.name} — {p.location || "no location"} · {p.itemCount} item(s) · {p.collected ? "collected" : "to collect"}</li>)}
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
