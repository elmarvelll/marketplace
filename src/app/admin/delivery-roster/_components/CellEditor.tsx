// src/app/admin/delivery-roster/_components/CellEditor.tsx
//
// Edits one recurring cell (slot x weekday): who works it every week and its maximum deliveries. Opens as a side
// drawer on tablet/desktop and a bottom sheet on phones. Saving goes through useRosterChange, so a change that would
// affect deliveries already booked asks for an explicit decision first.

"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import ImpactConfirm from "./ImpactConfirm";
import { useRosterChange } from "./useRosterChange";
import type { Operation, PersonRef, RosterCellView, RosterSlot } from "./roster-types";
import { STATUS_LABELS, STATUS_STYLES, formatDay, limitText, slotWindow } from "./roster-types";

export default function CellEditor({
  operation,
  slot,
  dayName,
  cell,
  defaultMax,
  deliverers,
  onClose,
  onSaved,
}: {
  operation: Operation;
  slot: RosterSlot;
  dayName: string;
  cell: RosterCellView;
  defaultMax: number | null;
  deliverers: PersonRef[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>(cell.deliverers.map((d) => d.id));
  const [useDefault, setUseDefault] = useState(cell.maxDeliveries === null);
  const [limit, setLimit] = useState(String(cell.maxDeliveries ?? cell.effectiveMax ?? ""));
  const change = useRosterChange(operation, onSaved);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !change.saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [change.saving, onClose]);

  // Approved deliverers, plus anyone already on this cell who no longer is (so they can be removed).
  const options = [...deliverers, ...cell.deliverers.filter((d) => !deliverers.some((o) => o.id === d.id))];
  const atPositions = selected.length >= slot.staffPositions;
  const parsedLimit = limit.trim() === "" ? null : Number(limit);
  const limitInvalid = !useDefault && (parsedLimit === null || !Number.isInteger(parsedLimit) || parsedLimit < 0);
  const { upcoming } = cell;

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const save = () =>
    change.submit({ kind: "cell", slotId: slot.id, weekday: cell.weekday, delivererIds: selected, maxDeliveries: useDefault ? null : parsedLimit });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end" role="dialog" aria-modal="true" aria-labelledby="cell-editor-title">
      <button type="button" aria-label="Close editor" className="absolute inset-0 bg-black/30" onClick={() => !change.saving && onClose()} />
      <div className="relative w-full md:w-[440px] max-h-[92vh] md:max-h-none overflow-y-auto bg-white rounded-t-2xl md:rounded-none p-5 space-y-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="cell-editor-title" className="text-lg font-bold text-gray-900">
              Every {dayName} · {slot.label}
            </h2>
            <p className="text-sm text-gray-500">{slotWindow(slot)} · recurring every week</p>
          </div>
          <button type="button" onClick={onClose} disabled={change.saving} aria-label="Close" className="p-1 text-gray-500 hover:text-gray-800">
            <X size={20} />
          </button>
        </div>

        <section className="rounded-xl border border-gray-200 p-3 space-y-1" aria-label="Next occurrence">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Next: {formatDay(upcoming.date, { weekday: "long", day: "numeric", month: "long" })}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[upcoming.status]}`}>{STATUS_LABELS[upcoming.status]}</span>
            {upcoming.hasException && <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200">Exception on this date</span>}
          </div>
          <p className="text-sm text-gray-900">
            {upcoming.booked} booked ({upcoming.paid} paid, {upcoming.pending} awaiting payment) · {upcoming.limit === null ? "no limit" : `${upcoming.remaining} remaining of ${upcoming.limit}`}
          </p>
          {upcoming.status === "full" && (
            <p className="flex items-center gap-1 text-sm font-medium text-red-700">
              <AlertTriangle size={14} /> This occurrence is full — no more deliveries will be booked into it.
            </p>
          )}
          {upcoming.hasException && <p className="text-xs text-gray-600">This date&apos;s exception overrides the weekly settings below — edit it in the Date view.</p>}
        </section>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-gray-900">Deliverers every {dayName}</legend>
          <p className="text-xs text-gray-500">
            {slot.staffPositions} position(s) on this slot. Staffing is separate from the delivery limit below.
          </p>
          {options.length === 0 ? (
            <p className="text-sm text-gray-500">No approved deliverers yet.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
              {options.map((d) => {
                const checked = selected.includes(d.id);
                const ineligible = d.status !== "APPROVED";
                return (
                  <label key={d.id} className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-900">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={change.saving || (!checked && (atPositions || ineligible))}
                      onChange={() => toggle(d.id)}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span className="flex-1">{d.name}</span>
                    {ineligible && <span className="text-xs font-medium text-red-700">{d.status.toLowerCase()} — never planned</span>}
                  </label>
                );
              })}
            </div>
          )}
          {selected.length === 0 && <p className="text-xs font-medium text-amber-800">Nobody will be scheduled — the slot shows as unassigned.</p>}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-gray-900">Maximum deliveries per {dayName}</legend>
          <label className="flex items-center gap-2 text-sm text-gray-900">
            <input type="radio" name="limit-mode" checked={useDefault} onChange={() => setUseDefault(true)} className="w-4 h-4 accent-blue-600" />
            Use the roster default ({limitText(defaultMax).toLowerCase()})
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-900">
            <input type="radio" name="limit-mode" checked={!useDefault} onChange={() => setUseDefault(false)} className="w-4 h-4 accent-blue-600" />
            Set a limit for this cell:
            <input
              type="number"
              min={0}
              inputMode="numeric"
              aria-label="Maximum deliveries"
              value={limit}
              disabled={useDefault || change.saving}
              onChange={(e) => setLimit(e.target.value)}
              className="w-20 px-2 py-1 border border-gray-400 bg-white rounded-lg text-sm text-gray-900 disabled:opacity-40"
            />
          </label>
          {limitInvalid && <p className="text-xs font-medium text-red-700">Enter a whole number of 0 or more.</p>}
          <p className="text-xs text-gray-500">
            Counts deliveries, not people. When full, checkout offers the next available slot instead. Lowering it below what&apos;s already booked never
            cancels anything — you&apos;ll be asked to confirm.
          </p>
        </fieldset>

        {change.error && (
          <p role="alert" className="text-sm p-2.5 rounded-lg text-red-700 bg-red-100">
            {change.error}
          </p>
        )}

        {change.pending ? (
          <ImpactConfirm impact={change.pending.impact} saving={change.saving} onConfirm={change.confirm} onCancel={change.cancel} />
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={change.saving || limitInvalid}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-40"
            >
              {change.saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {change.saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={onClose} disabled={change.saving} className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
