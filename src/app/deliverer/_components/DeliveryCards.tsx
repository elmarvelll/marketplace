// src/app/deliverer/_components/DeliveryCards.tsx
//
// The deliverer's Vendor Market delivery cards (manifest), one per slot
// occurrence: the vendors to buy/collect from (information only — nothing to
// confirm there, so no connection is needed at the vendor), then each student
// delivery with its MASKED code. A delivery is "Processing order" from
// assignment until the student's code is verified, then "Delivered". The
// deliverer types the six digits the student tells them; the code is
// verified only by the server, and queued on the phone when offline
// (offline-code-queue.ts) — shown as "Awaiting synchronization", never as
// delivered. Printable: "Print card" prints just the cards.

"use client";

import { useState } from "react";
import { isAxiosError } from "axios";
import { AlertTriangle, CheckCircle2, Clock, CloudOff, Loader2, MapPin, Phone, Printer, Store, XCircle } from "lucide-react";
import api from "@/lib/axios";
import { useOfflineCodeQueue, type CodeResult, type QueuedCode } from "./offline-code-queue";

export interface ManifestDelivery {
  bookingId: string;
  reference: string;
  studentFirstName: string;
  deliveryLocation: string | null;
  vendors: { name: string; items: { name: string; quantity: number }[] }[];
  status: "PROCESSING_ORDER" | "DELIVERED" | "FAILED" | "CANCELLED";
  maskedCode: string | null;
  codeLocked: boolean;
  attemptsLeft: number;
  deadlineAt: string;
  overdue: boolean;
  failedAttempts: number;
  retryDeliveryAt: string | null;
  pendingLateReview: boolean;
  confirmation: { method: "DELIVERER" | "ADMIN_FALLBACK"; at: string; late: boolean } | null;
}

export interface ManifestCard {
  key: string;
  date: string;
  slotLabel: string;
  arriveBy: string;
  deliverer: { id: string; name: string; phone: string | null };
  attendance: { state: "CHECKED_IN" | "CHECKED_IN_LATE" | "NOT_RECORDED"; checkedInAt: string | null };
  meetingPoint: string | null;
  pickups: { businessId: string; name: string; location: string | null; contact: string | null; orderRefs: string[]; itemCount: number }[];
  deliveries: ManifestDelivery[];
}

const STATUS_TEXT: Record<ManifestDelivery["status"], string> = {
  PROCESSING_ORDER: "Processing order",
  DELIVERED: "Delivered",
  FAILED: "Attempt failed — retry scheduled",
  CANCELLED: "Cancelled",
};
const STATUS_CLASS: Record<ManifestDelivery["status"], string> = {
  PROCESSING_ORDER: "bg-blue-50 text-blue-700",
  DELIVERED: "bg-green-50 text-green-700",
  FAILED: "bg-amber-50 text-amber-800",
  CANCELLED: "bg-gray-100 text-gray-700",
};

// What the delivery's badge says. A code saved on the phone but not yet
// verified by the server is never shown as delivered.
export function deliveryBadge(d: Pick<ManifestDelivery, "status">, queued: boolean): { text: string; className: string } {
  if (queued && d.status !== "DELIVERED") return { text: "Awaiting synchronization", className: "bg-amber-50 text-amber-800" };
  return { text: STATUS_TEXT[d.status], className: STATUS_CLASS[d.status] };
}

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

export function resultMessage(result: CodeResult): { tone: "ok" | "bad" | "warn"; text: string } {
  switch (result.outcome) {
    case "VERIFIED":
      if (result.alreadyDelivered) return { tone: "ok", text: "Already confirmed as delivered." };
      return result.late
        ? { tone: "ok", text: "Code verified — delivered. It arrived after the end-of-day deadline, so it's recorded as late." }
        : { tone: "ok", text: "Code verified — delivered." };
    case "REJECTED":
      return result.reason === "locked"
        ? { tone: "bad", text: "Too many wrong codes — this delivery is locked. Contact the Marketplace admin." }
        : { tone: "bad", text: `Wrong code — check the six digits with the student and try again. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left.` };
    case "LATE_REVIEW":
      return { tone: "warn", text: "Received after the deadline — sent to an admin for review. It isn't marked delivered yet." };
    default:
      return { tone: "bad", text: result.message };
  }
}

export default function DeliveryCards({ cards, onChanged }: { cards: ManifestCard[]; onChanged: () => void }) {
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
        setMessages((m) => ({ ...m, [bookingId]: { tone: "warn", text: "Saved on this phone — awaiting synchronization. It will be sent and checked automatically when you're back online." } }));
      } else {
        setMessages((m) => ({ ...m, [bookingId]: resultMessage(result) }));
        onChanged();
      }
    } finally {
      setBusy(null);
    }
  };

  if (cards.length === 0) {
    return <p className="text-sm text-gray-500">No Vendor Market deliveries assigned to you.</p>;
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <p role="status" className="flex items-center gap-2 text-sm p-3 rounded-xl bg-amber-50 text-amber-800 print:hidden">
          <CloudOff size={16} /> {pending.length} delivery code{pending.length === 1 ? "" : "s"} awaiting synchronization — they&apos;ll be sent automatically when you&apos;re online.
        </p>
      )}
      <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 print:hidden">
        <Printer size={15} /> Print card
      </button>

      {cards.map((card) => {
        const live = card.deliveries.filter((d) => d.status !== "CANCELLED");
        const processing = card.deliveries.filter((d) => d.status === "PROCESSING_ORDER").length;
        return (
          <article key={card.key} className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 break-inside-avoid">
            <header className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {dayFormatter.format(new Date(`${card.date}T00:00:00Z`))} · {card.slotLabel}
                </h3>
                <p className="text-xs text-gray-500">
                  Be at {card.meetingPoint ?? "the meeting point"} by {card.arriveBy}
                  {card.attendance.checkedInAt && ` · checked in ${timeFormatter.format(new Date(card.attendance.checkedInAt))}`}
                </p>
              </div>
              <span className="text-xs text-gray-500">
                {live.length} deliver{live.length === 1 ? "y" : "ies"}
                {processing > 0 && ` · ${processing} processing`}
              </span>
            </header>

            <section className="mb-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Collect from</h4>
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
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500 mt-2 print:hidden">Nothing to confirm at the vendor — just collect the orders. Each delivery is confirmed with the student&apos;s code.</p>
            </section>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Deliveries</h4>
              <ul className="space-y-3">
                {card.deliveries.map((d) => {
                  const msg = messages[d.bookingId];
                  const queued = pendingFor(d.bookingId);
                  const badge = deliveryBadge(d, queued);
                  const canConfirm = d.status === "PROCESSING_ORDER" && !d.codeLocked && !queued;
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
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>{badge.text}</span>
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
                        {d.status === "PROCESSING_ORDER" && (
                          <span className={`flex items-center gap-1 ${d.overdue ? "text-red-700 font-medium" : ""}`}>
                            <Clock size={12} /> Confirm by {timeFormatter.format(new Date(d.deadlineAt))}
                          </span>
                        )}
                        {d.status === "DELIVERED" && d.confirmation && (
                          <span className="flex items-center gap-1 text-green-700">
                            <CheckCircle2 size={12} /> Confirmed {timeFormatter.format(new Date(d.confirmation.at))}
                            {d.confirmation.method === "ADMIN_FALLBACK" && " by an admin"}
                            {d.confirmation.late && " (late)"}
                          </span>
                        )}
                        {d.failedAttempts > 0 && <span className="text-amber-700">{d.failedAttempts} failed attempt(s)</span>}
                        {d.pendingLateReview && <span className="text-amber-700">Late confirmation under admin review</span>}
                      </div>
                      {d.overdue && !queued && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs text-red-700">
                          <AlertTriangle size={13} className="mt-px shrink-0" />
                          Past the end-of-day deadline — the admin has been alerted. If you delivered it, still enter the student&apos;s code (it&apos;s recorded as late), or give the code to the admin if you can&apos;t.
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
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
                        {d.status === "PROCESSING_ORDER" && !queued && (
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
        );
      })}
    </div>
  );
}
