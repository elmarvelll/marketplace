// src/app/admin/delivery-roster/_components/DateView.tsx
//
// One calendar date, resolved: each slot's staff and limit after any exception, what's booked into it, and each booked
// delivery's planned deliverer. Exceptions set here apply to this date only — the weekly template never changes. Past
// dates are read-only.

"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RotateCcw, Pencil } from "lucide-react";
import api from "@/lib/axios";
import ImpactConfirm from "./ImpactConfirm";
import { errorMessage, useRosterChange } from "./useRosterChange";
import type { Operation, PersonRef, RosterDateSlotView, RosterDateView } from "./roster-types";
import { STATUS_LABELS, STATUS_STYLES, formatDay, limitText, slotWindow } from "./roster-types";

const shiftDate = (iso: string, days: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

const LIMIT_SOURCE: Record<string, string> = {
  closed: "closed for this date",
  exception: "set for this date",
  weekly: "weekly",
  default: "roster default",
  none: "no limit",
};

function names(people: PersonRef[]) {
  return people.length ? people.map((p) => (p.status === "APPROVED" ? p.name : `${p.name} (${p.status.toLowerCase()})`)).join(", ") : "Unassigned";
}

function ExceptionEditor({
  operation,
  date,
  view,
  deliverers,
  onDone,
  onSaved,
}: {
  operation: Operation;
  date: string;
  view: RosterDateSlotView;
  deliverers: PersonRef[];
  onDone: () => void;
  onSaved: (message: string) => void;
}) {
  const ex = view.exception;
  const [closed, setClosed] = useState(ex?.closed ?? false);
  const [limit, setLimit] = useState(ex?.maxDeliveries === null || ex?.maxDeliveries === undefined ? "" : String(ex.maxDeliveries));
  const [replace, setReplace] = useState(ex?.replaceDeliverers ?? false);
  const [staff, setStaff] = useState<string[]>(ex?.replaceDeliverers ? ex.delivererIds : view.occurrence.staff.map((p) => p.id));
  const [note, setNote] = useState(ex?.note ?? "");
  const change = useRosterChange(operation, (m) => {
    onSaved(m);
    onDone();
  });
  const parsed = limit.trim() === "" ? null : Number(limit);
  const invalid = !closed && parsed !== null && (!Number.isInteger(parsed) || parsed < 0);
  const nothing = !closed && !replace && parsed === null;

  return (
    <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50/40 p-3 space-y-3">
      <p className="text-sm font-semibold text-gray-900">Exception for {formatDay(date, { weekday: "long", day: "numeric", month: "long" })} only</p>
      <label className="flex items-center gap-2 text-sm text-gray-900">
        <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} className="w-4 h-4 accent-blue-600" />
        Close this slot on this date (no deliveries)
      </label>
      {!closed && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-gray-900">
          Maximum deliveries on this date:
          <input
            type="number"
            min={0}
            value={limit}
            placeholder={`weekly: ${view.weekly.maxDeliveries ?? "—"}`}
            onChange={(e) => setLimit(e.target.value)}
            aria-label="Maximum deliveries on this date"
            className="w-28 px-2 py-1 border border-gray-400 bg-white rounded-lg text-sm text-gray-900"
          />
          <span className="text-xs text-gray-500">(blank = keep the weekly limit)</span>
        </label>
      )}
      <label className="flex items-center gap-2 text-sm text-gray-900">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="w-4 h-4 accent-blue-600" />
        Use different deliverers on this date
      </label>
      {replace && (
        <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          {deliverers.map((d) => (
            <label key={d.id} className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-900">
              <input
                type="checkbox"
                checked={staff.includes(d.id)}
                disabled={!staff.includes(d.id) && staff.length >= view.slot.staffPositions}
                onChange={() => setStaff((cur) => (cur.includes(d.id) ? cur.filter((x) => x !== d.id) : [...cur, d.id]))}
                className="w-4 h-4 accent-blue-600"
              />
              {d.name}
            </label>
          ))}
          {deliverers.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">No approved deliverers.</p>}
        </div>
      )}
      <label className="block text-sm text-gray-900">
        Note (optional)
        <input
          type="text"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. David unavailable — exam day"
          className="mt-1 w-full px-3 py-1.5 border border-gray-400 bg-white rounded-lg text-sm text-gray-900"
        />
      </label>
      {invalid && <p className="text-xs font-medium text-red-700">Enter a whole number of 0 or more, or leave it blank.</p>}
      {nothing && <p className="text-xs text-gray-600">Choose at least one change — or cancel to keep the weekly roster.</p>}
      {change.error && (
        <p role="alert" className="text-sm p-2.5 rounded-lg text-red-700 bg-red-100">
          {change.error}
        </p>
      )}
      {change.pending ? (
        <ImpactConfirm impact={change.pending.impact} saving={change.saving} onConfirm={change.confirm} onCancel={change.cancel} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={change.saving || invalid || nothing}
            onClick={() =>
              change.submit({ kind: "exception", slotId: view.slot.id, date, closed, maxDeliveries: closed ? null : parsed, replaceDeliverers: replace, delivererIds: replace ? staff : [], note: note.trim() || null })
            }
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-40"
          >
            {change.saving && <Loader2 size={14} className="animate-spin" />}
            Save exception
          </button>
          <button type="button" disabled={change.saving} onClick={onDone} className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-white transition">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function PlanSelect({ row, deliverers, disabled, onChange }: { row: RosterDateSlotView["deliveries"][number]; deliverers: PersonRef[]; disabled: boolean; onChange: (id: string | null) => void }) {
  return (
    <select
      aria-label={`Planned deliverer for ${row.reference || "this delivery"}`}
      value={row.plannedDeliverer?.id ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      className="px-2 py-1 border border-gray-400 bg-white rounded-lg text-xs text-gray-900 disabled:opacity-50"
    >
      <option value="">No one planned</option>
      {[...deliverers, ...(row.plannedDeliverer && !deliverers.some((d) => d.id === row.plannedDeliverer!.id) ? [row.plannedDeliverer] : [])].map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

export default function DateView({ operation, initialDate, today, onSaved }: { operation: Operation; initialDate: string; today: string; onSaved: (message: string) => void }) {
  const [date, setDate] = useState(initialDate);
  const [day, setDay] = useState<RosterDateView | null>(null);
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [editing, setEditing] = useState<string | null>(null);
  const [rowError, setRowError] = useState("");
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const load = useCallback(
    async (target: string) => {
      setState("loading");
      try {
        const res = await api.get<{ day: RosterDateView }>("/marketplace/admin/delivery-roster/date", { params: { operation, date: target } });
        setDay(res.data.day);
        setState("loaded");
      } catch {
        setState("error");
      }
    },
    [operation]
  );

  useEffect(() => {
    const run = async () => {
      await load(date);
    };
    run();
  }, [date, load]);

  const restore = useRosterChange(operation, (m) => {
    onSaved(m);
    void load(date);
  });

  const setPlan = async (row: RosterDateSlotView["deliveries"][number], delivererId: string | null) => {
    const key = row.scheduledDeliveryId ?? row.bookingId ?? "";
    setBusyRow(key);
    setRowError("");
    try {
      await api.put("/marketplace/admin/delivery-roster/plans", { scheduledDeliveryId: row.scheduledDeliveryId ?? undefined, bookingId: row.scheduledDeliveryId ? undefined : row.bookingId, delivererId });
      onSaved("Planned deliverer updated.");
      await load(date);
    } catch (err) {
      setRowError(errorMessage(err, "Couldn't change the planned deliverer."));
    } finally {
      setBusyRow(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button type="button" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day" className="p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
          <ChevronLeft size={16} />
        </button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" className="px-2 py-1.5 border border-gray-400 bg-white text-gray-900 rounded-lg text-sm" />
        <button type="button" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day" className="p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
          <ChevronRight size={16} />
        </button>
        <button type="button" onClick={() => setDate(today)} className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50">
          Today
        </button>
        <span className="text-sm font-medium text-gray-900">{formatDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
      </div>

      {(rowError || restore.error) && (
        <p role="alert" className="mb-3 text-sm p-2.5 rounded-lg text-red-700 bg-red-100">
          {rowError || restore.error}
        </p>
      )}
      {restore.pending && (
        <div className="mb-3">
          <ImpactConfirm impact={restore.pending.impact} saving={restore.saving} onConfirm={restore.confirm} onCancel={restore.cancel} />
        </div>
      )}

      {state === "loading" && (
        <div className="flex justify-center py-12">
          <Loader2 size={22} className="animate-spin text-gray-500" />
        </div>
      )}
      {state === "error" && <p className="text-sm text-gray-500 py-6">Couldn&apos;t load this date.</p>}
      {state === "loaded" && day && (
        <div className="space-y-3">
          {!day.editable && <p className="text-xs text-gray-600">This date is in the past — shown for reference only.</p>}
          {day.slots.length === 0 && <p className="text-sm text-gray-500">No time slots for this roster.</p>}
          {day.slots.map((view) => {
            const o = view.occurrence;
            return (
              <div key={view.slot.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">
                      {view.slot.label} {!view.slot.active && <span className="text-xs font-normal text-gray-500">(retired slot)</span>}
                    </p>
                    <p className="text-xs text-gray-500">{slotWindow(view.slot)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[o.status]}`}>{STATUS_LABELS[o.status]}</span>
                    {o.hasException && <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200">Exception</span>}
                    {o.staff.length === 0 && !o.closed && <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200">Unassigned</span>}
                  </div>
                </div>

                <dl className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-gray-500">Deliverers ({o.staffSource === "exception" ? "set for this date" : "weekly"})</dt>
                    <dd className="text-gray-900 font-medium">{names(o.staff)}</dd>
                    {view.dateRoster.length > 0 && <dd className="text-gray-500">Includes date-only roster: {names(view.dateRoster)}</dd>}
                  </div>
                  <div>
                    <dt className="text-gray-500">Limit ({LIMIT_SOURCE[o.limitSource]})</dt>
                    <dd className="text-gray-900 font-medium">{limitText(o.limit)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Booked</dt>
                    <dd className="text-gray-900 font-medium">
                      {o.booked} ({o.paid} paid, {o.pending} awaiting payment){o.remaining !== null ? ` · ${o.remaining} remaining` : ""}
                    </dd>
                    {o.overCapacity && <dd className="text-red-700 font-semibold">Over the limit — existing deliveries kept, new bookings stopped</dd>}
                  </div>
                </dl>
                {o.note && <p className="mt-1 text-xs text-gray-700">Note: {o.note}</p>}

                {day.editable && editing !== view.slot.id && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(view.slot.id)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      <Pencil size={12} /> {view.exception ? "Edit exception" : "Add exception for this date"}
                    </button>
                    {view.exception && (
                      <button
                        type="button"
                        disabled={restore.saving}
                        onClick={() => restore.submit({ kind: "clear-exception", slotId: view.slot.id, date: day.date })}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <RotateCcw size={12} /> Restore weekly roster
                      </button>
                    )}
                  </div>
                )}
                {editing === view.slot.id && (
                  <ExceptionEditor
                    operation={operation}
                    date={day.date}
                    view={view}
                    deliverers={day.deliverers}
                    onDone={() => setEditing(null)}
                    onSaved={(m) => {
                      onSaved(m);
                      void load(date);
                    }}
                  />
                )}

                {view.deliveries.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <caption className="sr-only">Deliveries booked into {view.slot.label}</caption>
                      <thead>
                        <tr className="text-gray-500">
                          <th scope="col" className="py-1 pr-2 font-medium">Delivery</th>
                          <th scope="col" className="py-1 pr-2 font-medium">Payment</th>
                          <th scope="col" className="py-1 pr-2 font-medium">Planned deliverer</th>
                          <th scope="col" className="py-1 font-medium">Assigned</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.deliveries.map((row) => {
                          const key = row.scheduledDeliveryId ?? row.bookingId ?? row.orderIds[0];
                          return (
                            <tr key={key} className="border-t border-gray-100 align-top">
                              <td className="py-1.5 pr-2 text-gray-900">
                                <span className="block font-medium">{row.businessNames.join(", ")}</span>
                                <span className="block text-gray-500">
                                  {row.buyerName} · #{row.orderIds[0]?.slice(0, 8)}
                                </span>
                              </td>
                              <td className="py-1.5 pr-2">{row.paid ? <span className="text-green-700 font-medium">Paid</span> : <span className="text-amber-800 font-medium">Awaiting payment</span>}</td>
                              <td className="py-1.5 pr-2">
                                {row.dispatched ? (
                                  <span className="text-gray-900">{row.plannedDeliverer?.name ?? "—"}</span>
                                ) : (
                                  <span className="flex flex-wrap items-center gap-1.5">
                                    <PlanSelect row={row} deliverers={day.deliverers} disabled={busyRow === key || !day.editable} onChange={(id) => setPlan(row, id)} />
                                    {row.planSource && <span className="text-[10px] text-gray-500">{row.planSource === "MANUAL" ? "set by admin" : row.planSource === "ROSTER" ? "from roster" : "roster suggestion"}</span>}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 text-gray-900">{row.assignedDeliverers.length ? names(row.assignedDeliverers) : <span className="text-gray-500">Not yet</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
