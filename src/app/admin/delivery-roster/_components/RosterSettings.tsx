// src/app/admin/delivery-roster/_components/RosterSettings.tsx
//
// The roster's default maximum deliveries (used by every cell without its own limit), and the time slots: central
// Marketplace slots are managed here; Vendor timeframes stay on Admin -> Vendor Delivery, where vendors' bookings
// already depend on them.

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Plus, Save } from "lucide-react";
import api from "@/lib/axios";
import ImpactConfirm from "./ImpactConfirm";
import { errorMessage, useRosterChange } from "./useRosterChange";
import type { Operation, RosterSlot } from "./roster-types";
import { slotWindow } from "./roster-types";

type SlotDraft = { label: string; windowStart: string; windowEnd: string; staffPositions: number; active: boolean };

function SlotRow({ slot, onSaved }: { slot: RosterSlot; onSaved: (m: string) => void }) {
  const [draft, setDraft] = useState<SlotDraft>({ label: slot.label, windowStart: slot.windowStart, windowEnd: slot.windowEnd, staffPositions: slot.staffPositions, active: slot.active });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify({ label: slot.label, windowStart: slot.windowStart, windowEnd: slot.windowEnd, staffPositions: slot.staffPositions, active: slot.active });

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api.patch(`/marketplace/admin/delivery-roster/slots/${slot.id}`, draft);
      onSaved("Slot saved.");
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the slot."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-500">
          Label
          <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="block mt-0.5 w-40 px-2 py-1 border border-gray-400 bg-white rounded-lg text-sm text-gray-900" />
        </label>
        <label className="text-xs text-gray-500">
          Start
          <input type="time" value={draft.windowStart} onChange={(e) => setDraft({ ...draft, windowStart: e.target.value })} className="block mt-0.5 px-2 py-1 border border-gray-400 bg-white rounded-lg text-sm text-gray-900" />
        </label>
        <label className="text-xs text-gray-500">
          End
          <input type="time" value={draft.windowEnd} onChange={(e) => setDraft({ ...draft, windowEnd: e.target.value })} className="block mt-0.5 px-2 py-1 border border-gray-400 bg-white rounded-lg text-sm text-gray-900" />
        </label>
        <label className="text-xs text-gray-500">
          Positions
          <input
            type="number"
            min={0}
            value={draft.staffPositions}
            onChange={(e) => setDraft({ ...draft, staffPositions: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
            className="block mt-0.5 w-20 px-2 py-1 border border-gray-400 bg-white rounded-lg text-sm text-gray-900"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-900 pb-1">
          <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="w-4 h-4 accent-blue-600" />
          Active
        </label>
        {dirty && (
          <button type="button" disabled={saving} onClick={save} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export default function RosterSettings({ operation, defaultMax, onSaved }: { operation: Operation; defaultMax: number | null; onSaved: (m: string) => void }) {
  const [value, setValue] = useState(defaultMax === null ? "" : String(defaultMax));
  const [slots, setSlots] = useState<RosterSlot[] | null>(null);
  const [slotsError, setSlotsError] = useState("");
  const [adding, setAdding] = useState<SlotDraft>({ label: "", windowStart: "17:00", windowEnd: "18:00", staffPositions: 1, active: true });
  const [addError, setAddError] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const change = useRosterChange(operation, onSaved);

  const loadSlots = useCallback(async () => {
    try {
      const res = await api.get<{ slots: RosterSlot[] }>("/marketplace/admin/delivery-roster/slots", { params: { operation } });
      setSlots(res.data.slots);
      setSlotsError("");
    } catch {
      setSlotsError("Couldn't load the time slots.");
    }
  }, [operation]);

  useEffect(() => {
    const run = async () => {
      await loadSlots();
    };
    run();
  }, [loadSlots]);

  const parsed = value.trim() === "" ? null : Number(value);
  const invalid = parsed !== null && (!Number.isInteger(parsed) || parsed < 0);

  const addSlot = async () => {
    setAddBusy(true);
    setAddError("");
    try {
      await api.post("/marketplace/admin/delivery-roster/slots", adding);
      setAdding({ label: "", windowStart: "17:00", windowEnd: "18:00", staffPositions: 1, active: true });
      onSaved("Slot added.");
      await loadSlots();
    } catch (err) {
      setAddError(errorMessage(err, "Couldn't add the slot."));
    } finally {
      setAddBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-semibold text-gray-900 mb-1">Default maximum deliveries</h2>
        <p className="text-sm text-gray-500 mb-3">Applies to every slot occurrence without its own limit. Leave empty for no limit (how deliveries worked before the roster).</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            value={value}
            placeholder="No limit"
            aria-label="Default maximum deliveries"
            onChange={(e) => setValue(e.target.value)}
            className="w-32 px-3 py-2 border border-gray-400 bg-white rounded-xl text-sm text-gray-900"
          />
          <button
            type="button"
            disabled={change.saving || invalid || parsed === defaultMax}
            onClick={() => change.submit({ kind: "default", defaultMaxDeliveries: parsed })}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-40"
          >
            {change.saving && <Loader2 size={14} className="animate-spin" />} Save default
          </button>
        </div>
        {invalid && <p className="mt-1 text-xs text-red-700">Enter a whole number of 0 or more, or leave it empty.</p>}
        {change.error && <p role="alert" className="mt-2 text-sm p-2.5 rounded-lg text-red-700 bg-red-100">{change.error}</p>}
        {change.pending && (
          <div className="mt-3">
            <ImpactConfirm impact={change.pending.impact} saving={change.saving} onConfirm={change.confirm} onCancel={change.cancel} />
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold text-gray-900 mb-1">Time slots</h2>
        {operation === "VENDOR" ? (
          <>
            <p className="text-sm text-gray-500 mb-3">
              Vendor timeframes are the ones customers book at Vendor checkout. Add, retime or retire them on{" "}
              <Link href="/admin/vendor-delivery" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                Vendor Delivery <ExternalLink size={12} />
              </Link>
              ; their deliverer capacity is the roster&apos;s positions.
            </p>
            {slots?.map((s) => (
              <p key={s.id} className="text-sm text-gray-900">
                {s.label} · {slotWindow(s)} · {s.staffPositions} position(s) {s.active ? "" : "(inactive)"}
              </p>
            ))}
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-3">
              Central delivery slots. While at least one is active, Business checkout books each order into the earliest slot with room on the seller&apos;s
              delivery days; with none active it keeps the plain estimated delivery date. Retiring a slot never moves deliveries already booked into it.
            </p>
            <div className="space-y-2">
              {slots?.map((s) => (
                <SlotRow
                  key={`${s.id}-${s.label}-${s.windowStart}-${s.windowEnd}-${s.staffPositions}-${s.active}`}
                  slot={s}
                  onSaved={(m) => {
                    onSaved(m);
                    void loadSlots();
                  }}
                />
              ))}
              {slots?.length === 0 && <p className="text-sm text-gray-500">No central slots yet.</p>}
            </div>
            <div className="mt-4 bg-white rounded-2xl border border-dashed border-gray-300 p-3">
              <p className="text-sm font-semibold text-gray-900 mb-2">Add a slot</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-gray-500">
                  Label
                  <input value={adding.label} placeholder="5:00 PM - 6:00 PM" onChange={(e) => setAdding({ ...adding, label: e.target.value })} className="block mt-0.5 w-40 px-2 py-1 border border-gray-400 bg-white rounded-lg text-sm text-gray-900" />
                </label>
                <label className="text-xs text-gray-500">
                  Start
                  <input type="time" value={adding.windowStart} onChange={(e) => setAdding({ ...adding, windowStart: e.target.value })} className="block mt-0.5 px-2 py-1 border border-gray-400 bg-white rounded-lg text-sm text-gray-900" />
                </label>
                <label className="text-xs text-gray-500">
                  End
                  <input type="time" value={adding.windowEnd} onChange={(e) => setAdding({ ...adding, windowEnd: e.target.value })} className="block mt-0.5 px-2 py-1 border border-gray-400 bg-white rounded-lg text-sm text-gray-900" />
                </label>
                <label className="text-xs text-gray-500">
                  Positions
                  <input
                    type="number"
                    min={0}
                    value={adding.staffPositions}
                    onChange={(e) => setAdding({ ...adding, staffPositions: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
                    className="block mt-0.5 w-20 px-2 py-1 border border-gray-400 bg-white rounded-lg text-sm text-gray-900"
                  />
                </label>
                <button type="button" disabled={addBusy || !adding.label.trim()} onClick={addSlot} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40">
                  {addBusy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add slot
                </button>
              </div>
              {addError && <p role="alert" className="mt-2 text-xs text-red-700">{addError}</p>}
            </div>
          </>
        )}
        {slotsError && <p className="text-sm text-gray-500">{slotsError}</p>}
      </section>
    </div>
  );
}
