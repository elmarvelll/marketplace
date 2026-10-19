// src/app/deliverer/_components/DeliveryCards.tsx
//
// The deliverer's Vendor Market delivery cards (manifest), one per shift
// (slot occurrence): its state (Scheduled until an admin checks them in at the
// meeting point, then In progress, Delivered — or Missed), vendor pickups,
// then each student delivery with its MASKED code. Actions only work once the
// shift is in progress (the server enforces it too). The
// deliverer types the six digits the student tells them; the code is
// verified only by the server, and queued on the phone when offline
// (offline-code-queue.ts). Printable: "Print card" prints just the cards.

"use client";

import { useState } from "react";
import { isAxiosError } from "axios";
import { CheckCircle2, Clock, CloudOff, Loader2, MapPin, Phone, Printer, Store, XCircle } from "lucide-react";
import api from "@/lib/axios";
import { useOfflineCodeQueue, type CodeResult, type QueuedCode } from "./offline-code-queue";

export interface ManifestDelivery {
  bookingId: string;
  reference: string;
  studentFirstName: string;
  deliveryLocation: string | null;
  vendors: { name: string; items: { name: string; quantity: number }[] }[];
  status: "AWAITING_PICKUP" | "COLLECTED" | "ON_THE_WAY" | "DELIVERED" | "FAILED" | "CANCELLED";
  maskedCode: string | null;
  codeLocked: boolean;
  attemptsLeft: number;
  deadlineAt: string;
  failedAttempts: number;
  retryDeliveryAt: string | null;
  pendingLateReview: boolean;
}

export interface ManifestCard {
  key: string;
  date: string;
  slotLabel: string;
  arriveBy: string;
  deliverer: { id: string; name: string; phone: string | null };
  shift: { state: ShiftState; unlocked: boolean; checkedInAt: string | null; late: boolean; endsAt: string };
  meetingPoint: string | null;
  pickups: { businessId: string; name: string; location: string | null; contact: string | null; orderRefs: string[]; itemCount: number; collected: boolean }[];
  deliveries: ManifestDelivery[];
}

export type ShiftState = "SCHEDULED" | "IN_PROGRESS" | "DELIVERED" | "MISSED";

export const SHIFT_BADGE: Record<ShiftState, { text: string; className: string }> = {
  SCHEDULED: { text: "Scheduled", className: "bg-gray-100 text-gray-700" },
  IN_PROGRESS: { text: "In progress", className: "bg-blue-50 text-blue-700" },
  DELIVERED: { text: "Delivered", className: "bg-green-50 text-green-700" },
  MISSED: { text: "Missed", className: "bg-red-50 text-red-700" },
};

function shiftMessage(card: ManifestCard): { tone: "info" | "bad" | "ok"; text: string } | null {
  const where = card.meetingPoint ?? "the meeting point";
  switch (card.shift.state) {
    case "SCHEDULED":
      return { tone: "info", text: `Report to ${where} by ${card.arriveBy}. An admin will check you in and start your shift — until then you can't collect or deliver.` };
    case "MISSED":
      return card.shift.unlocked
        ? { tone: "bad", text: "Missed — you weren't checked in before the slot ended. An admin has let you finish these deliveries; the shift still counts as missed." }
        : { tone: "bad", text: "Missed — you weren't checked in before the slot ended. Contact the Marketplace admin." };
    case "DELIVERED":
      return { tone: "ok", text: "All deliveries on this card are done." };
    default:
      return null;
  }
}

const STATUS_TEXT: Record<ManifestDelivery["status"], string> = {
  AWAITING_PICKUP: "Collect from vendor",
  COLLECTED: "Collected",
  ON_THE_WAY: "On the way",
  DELIVERED: "Delivered",
  FAILED: "Attempt failed",
  CANCELLED: "Cancelled",
};
const dayFormatter = new Intl.DateTimeFormat("en-NG", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const timeFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

// "1_3_5_" -> "1 • 3 • 5 •" — big, readable, obviously partial.
function MaskedCode({ masked }: { masked: string }) {
  return (
    <span className="font-mono text-lg font-bold tracking-[0.3em]" aria-label={`Partial code ${masked.split("").map((c) => (c === "_" ? "hidden" : c)).join(" ")}`}>
      {masked.split("").map((c, i) => (c === "_" ? <span key={i} className="text-gray-300">•</span> : <span key={i}>{c}</span>))}
    </span>
  );
}

function resultMessage(result: CodeResult): { tone: "ok" | "bad" | "warn"; text: string } {
  switch (result.outcome) {
    case "VERIFIED":
      return { tone: "ok", text: result.alreadyDelivered ? "Already confirmed as delivered." : "Code verified — delivery complete." };
    case "REJECTED":
      return result.reason === "locked"
        ? { tone: "bad", text: "Too many wrong codes — this delivery is locked. Contact the Marketplace admin." }
        : { tone: "bad", text: `Wrong code. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left.` };
    case "LATE_REVIEW":
      return { tone: "warn", text: "Received after the 24-hour deadline — sent to an admin for review. It isn't marked delivered yet." };
    default:
      return { tone: "bad", text: result.message };
  }
}

export type ShiftCounts = Record<ShiftState, number>;

export default function DeliveryCards({ cards, shiftCounts, onChanged }: { cards: ManifestCard[]; shiftCounts?: ShiftCounts; onChanged: () => void }) {
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { tone: "ok" | "bad" | "warn"; text: string }>>({});

  const { pending, submit } = useOfflineCodeQueue((entry: QueuedCode, result: CodeResult) => {
    setMessages((m) => ({ ...m, [entry.bookingId]: resultMessage(result) }));
    onChanged();
  });
  const pendingFor = (bookingId: string) => pending.some((p) => p.bookingId === bookingId);

  const act = async (bookingId: string, action: () => Promise<unknown>) => {
    setBusy(bookingId);
    try {
      await action();
      onChanged();
    } catch (err) {
      setMessages((m) => ({ ...m, [bookingId]: { tone: "bad", text: (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "That didn't work. Try again." } }));
    } finally {
      setBusy(null);
    }
  };

  const confirm = async (bookingId: string) => {
    const code = (codes[bookingId] ?? "").replace(/\D/g, "");
    if (code.length !== 6) {
      setMessages((m) => ({ ...m, [bookingId]: { tone: "bad", text: "Enter all six digits the student gives you." } }));
      return;
    }
    setBusy(bookingId);
    try {
      const result = await submit(bookingId, code);
      setCodes((c) => ({ ...c, [bookingId]: "" }));
      if (result === "queued") {
        setMessages((m) => ({ ...m, [bookingId]: { tone: "warn", text: "Saved on this phone — it will be sent and checked when you're back online." } }));
      } else {
        setMessages((m) => ({ ...m, [bookingId]: resultMessage(result) }));
        onChanged();
      }
    } finally {
      setBusy(null);
    }
  };

  const record = shiftCounts && (
    <p className="text-xs text-gray-600 print:hidden">
      Last 30 days: <strong>{shiftCounts.DELIVERED}</strong> delivered · <strong className={shiftCounts.MISSED > 0 ? "text-red-700" : undefined}>{shiftCounts.MISSED}</strong> missed
      {shiftCounts.IN_PROGRESS > 0 && <> · {shiftCounts.IN_PROGRESS} in progress</>}
      {shiftCounts.SCHEDULED > 0 && <> · {shiftCounts.SCHEDULED} scheduled</>}
    </p>
  );

  if (cards.length === 0) {
    return (
      <div className="space-y-2">
        {record}
        <p className="text-sm text-gray-500">No Vendor Market deliveries assigned to you.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {record}
      {pending.length > 0 && (
        <p role="status" className="flex items-center gap-2 text-sm p-3 rounded-xl bg-amber-50 text-amber-800 print:hidden">
          <CloudOff size={16} /> {pending.length} delivery code{pending.length === 1 ? "" : "s"} waiting for a connection — they&apos;ll be sent automatically.
        </p>
      )}
      <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 print:hidden">
        <Printer size={15} /> Print card
      </button>

      {cards.map((card) => (
        <article key={card.key} className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 break-inside-avoid">
          <header className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <div>
              <h3 className="font-semibold text-gray-900">
                {dayFormatter.format(new Date(`${card.date}T00:00:00Z`))} · {card.slotLabel}
              </h3>
              <p className="text-xs text-gray-500">
                Arrive by {card.arriveBy} at {card.meetingPoint ?? "the meeting point"}
                {card.shift.checkedInAt && ` · checked in ${timeFormatter.format(new Date(card.shift.checkedInAt))}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{card.deliveries.filter((d) => d.status !== "CANCELLED").length} deliveries</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${SHIFT_BADGE[card.shift.state].className}`}>{SHIFT_BADGE[card.shift.state].text}</span>
            </div>
          </header>
          {(() => {
            const m = shiftMessage(card);
            if (!m) return null;
            return (
              <p role="status" className={`mb-4 text-xs rounded-lg px-3 py-2 ${m.tone === "info" ? "bg-purple-50 text-purple-800" : m.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                {m.text}
              </p>
            );
          })()}

          <section className="mb-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Pickups</h4>
            <ul className="space-y-2">
              {card.pickups.map((p) => (
                <li key={p.businessId} className="flex flex-wrap items-start gap-2 text-sm rounded-xl bg-gray-50 p-3">
                  <Store size={15} className="mt-0.5 text-gray-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">
                      {p.name} <span className="font-normal text-gray-500">· {p.itemCount} item{p.itemCount === 1 ? "" : "s"} · orders {p.orderRefs.join(", ")}</span>
                    </p>
                    <p className="text-xs text-gray-600">{p.location || "No pickup location set — ask the admin."}</p>
                    {p.contact && <p className="text-xs text-gray-500">{p.contact}</p>}
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${p.collected ? "bg-green-50 text-green-700" : "bg-gray-200 text-gray-700"}`}>
                    {p.collected ? "Collected" : "To collect"}
                  </span>
                </li>
              ))}
            </ul>
            {card.shift.unlocked && (
              <p className="text-xs text-gray-500 mt-2 print:hidden">Confirm each pickup with the vendor&apos;s code under &ldquo;Pending pickups&rdquo;.</p>
            )}
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Deliveries</h4>
            <ul className="space-y-3">
              {card.deliveries.map((d) => {
                const msg = messages[d.bookingId];
                const queued = pendingFor(d.bookingId);
                const working = card.shift.unlocked;
                const canConfirm = working && (d.status === "COLLECTED" || d.status === "ON_THE_WAY") && !d.codeLocked && !queued;
                return (
                  <li key={d.bookingId} className="rounded-xl border border-gray-100 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          #{d.reference} · {d.studentFirstName}
                        </p>
                        <p className="text-xs text-gray-600 flex items-center gap-1">
                          <MapPin size={12} /> {d.deliveryLocation || "No delivery location given"}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{queued ? "Pending verification" : STATUS_TEXT[d.status]}</span>
                    </div>
                    <ul className="mt-2 text-xs text-gray-600 space-y-0.5">
                      {d.vendors.map((v) => (
                        <li key={v.name}>
                          <span className="font-medium text-gray-800">{v.name}:</span> {v.items.map((i) => `${i.quantity} x ${i.name}`).join(", ")}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      {d.maskedCode && (
                        <span className="flex items-center gap-2">
                          Code <MaskedCode masked={d.maskedCode} />
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> Confirm by {timeFormatter.format(new Date(d.deadlineAt))}
                      </span>
                      {d.failedAttempts > 0 && <span className="text-amber-700">{d.failedAttempts} failed attempt(s)</span>}
                      {d.pendingLateReview && <span className="text-amber-700">Late confirmation under admin review</span>}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
                      {working && d.status === "COLLECTED" && (
                        <button
                          type="button"
                          disabled={busy === d.bookingId}
                          onClick={() => act(d.bookingId, () => api.post(`/marketplace/deliverer/bookings/${d.bookingId}/start`))}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          Start delivery
                        </button>
                      )}
                      {canConfirm && (
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void confirm(d.bookingId);
                          }}
                        >
                          <label className="sr-only" htmlFor={`code-${d.bookingId}`}>
                            Student&apos;s six-digit code
                          </label>
                          <input
                            id={`code-${d.bookingId}`}
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={7}
                            placeholder="6-digit code"
                            value={codes[d.bookingId] ?? ""}
                            onChange={(e) => setCodes((c) => ({ ...c, [d.bookingId]: e.target.value.replace(/[^\d ]/g, "") }))}
                            className="w-32 px-3 py-1.5 border border-gray-400 rounded-lg text-sm font-mono tracking-widest text-gray-900 bg-white"
                          />
                          <button type="submit" disabled={busy === d.bookingId} className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold disabled:opacity-50">
                            {busy === d.bookingId ? <Loader2 size={14} className="animate-spin" /> : "Confirm delivery"}
                          </button>
                        </form>
                      )}
                      {working && d.status === "ON_THE_WAY" && !queued && (
                        <button
                          type="button"
                          disabled={busy === d.bookingId}
                          onClick={() => {
                            const reason = window.prompt("Why couldn't you deliver this?");
                            if (reason) void act(d.bookingId, () => api.post(`/marketplace/deliverer/bookings/${d.bookingId}/fail-attempt`, { reason }));
                          }}
                          className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold disabled:opacity-50"
                        >
                          Couldn&apos;t deliver
                        </button>
                      )}
                      {d.codeLocked && d.status !== "DELIVERED" && <span className="text-xs text-red-700">Code locked — contact the admin.</span>}
                    </div>
                    {msg && (
                      <p
                        role="status"
                        className={`mt-2 flex items-start gap-1.5 text-xs ${msg.tone === "ok" ? "text-green-700" : msg.tone === "warn" ? "text-amber-700" : "text-red-700"}`}
                      >
                        {msg.tone === "ok" ? <CheckCircle2 size={13} className="mt-px" /> : msg.tone === "warn" ? <CloudOff size={13} className="mt-px" /> : <XCircle size={13} className="mt-px" />}
                        {msg.text}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          {card.deliverer.phone && (
            <p className="mt-3 text-[11px] text-gray-400 hidden print:flex items-center gap-1">
              <Phone size={11} /> {card.deliverer.name} · {card.deliverer.phone}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
