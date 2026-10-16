// src/app/business/_components/DropoffActionPanel.tsx
//
// "What do I do next?" for orders that are ready to be dropped off at the
// central drop-off point. Shown at the top of the seller's Orders tab
// whenever at least one order is in that stage — whichever section tab is
// open — so the next step can't be missed.
//
// It adds no new state or transition: the stage and action come from the
// existing seller drop-off flow (docs/marketplace/systems/central-dropoff-system.md):
//   READY_FOR_PICKUP, no code yet   -> "Get drop-off code" (issues the OTP)
//   READY_FOR_PICKUP, code issued   -> show the code to the Delivery
//                                      Coordinator; re-issue if it expired
//   coordinator verified the code   -> received; nothing more for the seller
// An order that isn't READY_FOR_PICKUP never appears here, the server
// rejects the action for any other state, and buttons are disabled while a
// request for that order is in flight (no duplicate submissions).
//
// The pickup point shown is exactly what an admin configured in Marketplace
// settings. If it isn't configured (or is marked inactive) the panel says so
// rather than inventing a location.

"use client";

import { AlertTriangle, CheckCircle2, Clock, Loader2, MapPin, PackageCheck } from "lucide-react";
import type { BusinessOrderSummary } from "@/types/order";

export interface DropoffPoint {
  dropoffWindowStart: string;
  dropoffWindowEnd: string;
  dropoffLocation: string | null;
  dropoffLocationName?: string | null;
  dropoffLocationInstructions?: string | null;
  dropoffLocationActive?: boolean;
}

const dateTime = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });
const timeOnly = new Intl.DateTimeFormat("en-NG", { timeStyle: "short" });

// The orders this panel is about: ready, and not yet handed to a deliverer.
export function ordersAwaitingDropoff(orders: BusinessOrderSummary[]): BusinessOrderSummary[] {
  return orders.filter((o) => o.status === "ACCEPTED" && o.fulfillmentStatus === "READY_FOR_PICKUP");
}

type Stage = "needs_code" | "code_issued" | "code_expired" | "received";

export function dropoffStage(order: BusinessOrderSummary, now: Date = new Date()): Stage {
  if (order.coordinatorReceivedAt) return "received";
  if (!order.dropoffOtp) return "needs_code";
  if (order.dropoffOtpExpiry && new Date(order.dropoffOtpExpiry) <= now) return "code_expired";
  return "code_issued";
}

const STAGE_TEXT: Record<Stage, { status: string; next: string }> = {
  needs_code: { status: "Ready — not dropped off yet", next: "Take the order to the pickup point, then get your drop-off code." },
  code_issued: { status: "Drop-off code issued", next: "Show this code to the Delivery Coordinator at the pickup point." },
  code_expired: { status: "Drop-off code expired", next: "Get a new code when you're at the pickup point." },
  received: { status: "Received by the Delivery Coordinator", next: "Nothing more to do — a deliverer will be assigned." },
};

export default function DropoffActionPanel({
  orders,
  point,
  busyOrderId,
  onRequestCode,
}: {
  orders: BusinessOrderSummary[];
  point: DropoffPoint | null;
  busyOrderId: string | null;
  onRequestCode: (orderId: string) => void;
}) {
  const awaiting = ordersAwaitingDropoff(orders);
  if (awaiting.length === 0) return null;

  const pending = awaiting.filter((o) => dropoffStage(o) !== "received");
  const hasLocation = Boolean(point?.dropoffLocation?.trim() || point?.dropoffLocationName?.trim());
  const inactive = point?.dropoffLocationActive === false;

  return (
    <section aria-labelledby="dropoff-panel-title" className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white" aria-hidden>
          <PackageCheck size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="dropoff-panel-title" className="text-base font-bold text-blue-950">
            {pending.length > 0
              ? `${pending.length} order${pending.length === 1 ? "" : "s"} ready to drop off`
              : "Dropped off — waiting for a deliverer"}
          </h2>

          <div className="mt-2 rounded-xl bg-white/80 border border-blue-100 p-3 text-sm text-gray-800">
            <p className="flex items-center gap-1.5 font-semibold text-gray-900">
              <MapPin size={14} className="text-blue-700" aria-hidden /> Pickup point
            </p>
            {hasLocation ? (
              <>
                {point?.dropoffLocationName && <p className="mt-1 font-medium break-words">{point.dropoffLocationName}</p>}
                {point?.dropoffLocation && <p className="break-words">{point.dropoffLocation}</p>}
              </>
            ) : (
              <p className="mt-1 flex items-start gap-1.5 text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                The pickup point location hasn&apos;t been set yet. Please contact the Marketplace admin before travelling.
              </p>
            )}
            {inactive && (
              <p className="mt-1 flex items-start gap-1.5 text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                This pickup point is currently marked inactive. Check with the Marketplace admin before dropping off.
              </p>
            )}
            {point?.dropoffWindowStart && point?.dropoffWindowEnd && (
              <p className="mt-1 flex items-center gap-1.5 text-gray-700">
                <Clock size={14} aria-hidden /> Drop-off window: {point.dropoffWindowStart}–{point.dropoffWindowEnd}
              </p>
            )}
            {point?.dropoffLocationInstructions && <p className="mt-1 whitespace-pre-line break-words text-gray-700">{point.dropoffLocationInstructions}</p>}
          </div>

          <ul className="mt-3 space-y-2">
            {awaiting.map((order) => {
              const stage = dropoffStage(order);
              const busy = busyOrderId === order.id;
              const text = STAGE_TEXT[stage];
              return (
                <li key={order.id} className="rounded-xl border border-blue-100 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">Order #{order.id.slice(0, 8)}</p>
                      <p className="text-xs text-gray-600">
                        {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                        {order.dropoffDeadline && stage !== "received" && (
                          <span className={order.missedDropoffDeadline ? "font-semibold text-red-700" : ""}>
                            {" "}· Drop off by {dateTime.format(new Date(order.dropoffDeadline))}
                            {order.missedDropoffDeadline && " — missed"}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-sm">
                        <span className="font-semibold text-gray-900">Status:</span>{" "}
                        <span className={stage === "received" ? "text-green-700" : stage === "code_expired" ? "text-amber-700" : "text-gray-800"}>{text.status}</span>
                      </p>
                      <p className="text-sm">
                        <span className="font-semibold text-gray-900">Next:</span> <span className="text-gray-800">{text.next}</span>
                      </p>
                    </div>

                    <div className="flex w-full min-w-0 flex-col items-stretch gap-1.5 sm:w-auto sm:shrink-0 sm:items-end">
                      {stage === "code_issued" && order.dropoffOtp && (
                        <>
                          <p className="rounded-lg bg-blue-600 px-3 py-1.5 text-center font-mono text-lg font-bold tracking-widest text-white" aria-label={`Drop-off code ${order.dropoffOtp.split("").join(" ")}`}>
                            {order.dropoffOtp.slice(0, 3)} {order.dropoffOtp.slice(3)}
                          </p>
                          {order.dropoffOtpExpiry && <p className="text-xs text-gray-600">Expires {timeOnly.format(new Date(order.dropoffOtpExpiry))}</p>}
                        </>
                      )}
                      {stage === "received" ? (
                        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700">
                          <CheckCircle2 size={15} aria-hidden /> Drop-off confirmed
                        </p>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onRequestCode(order.id)}
                          className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-center text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                            stage === "code_issued" ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50" : "bg-blue-600 text-white hover:bg-blue-700"
                          }`}
                        >
                          {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
                          {stage === "code_issued" ? "Get a new code" : "I'm at the pickup point — get my code"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
