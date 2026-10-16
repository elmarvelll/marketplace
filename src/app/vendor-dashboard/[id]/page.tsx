// src/app/vendor-dashboard/[id]/page.tsx
//
// The vendor dashboard's Profile tab (default route): vendor fields
// (name, category, description, location, availability window, image,
// bank details, pause toggle) plus "Set Product Deliveries Per Time
// Range" (spec §3) — the vendor's own per-timeframe order capacity. This
// is the ONLY place that capacity control exists; it must never appear on
// the Business profile (spec §2) — see
// docs/marketplace/decisions/vendor-independent-architecture.md.
//
// ImageUploadField/BankDetailsFields are reused from
// business/_components/ — they're generic presentational form fields with
// no Business-specific branding or endpoints (BankDetailsFields calls the
// generic Paystack bank-list/resolve-account routes), so this is the
// "genuinely shared, reuse it" case, not a violation of Vendor/Business
// separation.

"use client";

import { use, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, CheckCircle2, Clock, Loader2, Pencil, Save, Wallet, X } from "lucide-react";
import api from "@/lib/axios";
import { VENDOR_CATEGORIES } from "@/types/vendor";
import ImageUploadField from "../../business/_components/ImageUploadField";
import BankDetailsFields from "../../business/_components/BankDetailsFields";
import DeliveryDatePicker, { todayIsoDate } from "../../vendor-checkout/_components/DeliveryDatePicker";
import DeliveryScheduleSection from "../_components/DeliveryScheduleSection";
import { useVendorContext } from "../_components/VendorContext";
import type { VendorProfile } from "../_components/VendorApprovalGate";

interface VendorFormValues {
  name: string;
  vendorCategory: string;
  description: string;
  location: string;
  availabilityStart: string;
  availabilityEnd: string;
  publicId?: string;
  secureUrl?: string;
  bankName?: string;
  bankCode?: string;
  accountNumber?: string;
  accountHolderName?: string;
}

function formFromVendor(vendor: VendorProfile): VendorFormValues {
  return {
    name: vendor.name,
    vendorCategory: vendor.vendorCategory ?? VENDOR_CATEGORIES[0],
    description: vendor.description,
    location: vendor.location ?? "",
    availabilityStart: vendor.availabilityStart ?? "17:00",
    availabilityEnd: vendor.availabilityEnd ?? "20:00",
    publicId: vendor.publicId ?? undefined,
    secureUrl: vendor.secureUrl ?? undefined,
    bankName: vendor.bankName ?? undefined,
    bankCode: vendor.bankCode ?? undefined,
    accountNumber: vendor.accountNumber ?? undefined,
    accountHolderName: vendor.accountHolderName ?? undefined,
  };
}

interface CapacityRow {
  slotId: string;
  slotLabel: string;
  windowStart: string;
  windowEnd: string;
  defaultCapacity: number;
  overrideCapacity: number | null;
  capacity: number;
  booked: number;
  paid?: number;
  reserved?: number;
  // False when you don't deliver on the selected date at all.
  dateAvailable?: boolean;
}

// Editing a slot's capacity NEVER sends a request while the vendor is
// typing (spec §3) — inputs are controlled local state, and the only
// backend call is the single explicit "Save Capacity" click below, which
// batches every changed row. Date-specific (spec §7): the vendor picks a
// date (defaults to today, same Today/Tomorrow/custom picker as checkout)
// and edits/saves capacity for that date's override, falling back to the
// "Default" recurring value when no override exists yet.
function CapacitySection({ businessId, reloadKey = 0 }: { businessId: string; reloadKey?: number }) {
  const [date, setDate] = useState(() => todayIsoDate());
  const [rows, setRows] = useState<CapacityRow[]>([]);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState("");

  const load = async (targetDate: string) => {
    setLoadState("loading");
    try {
      const res = await api.get<{ capacity: CapacityRow[]; date: string }>(`/marketplace/vendor/${businessId}/capacity`, {
        params: { date: targetDate },
      });
      setRows(res.data.capacity);
      setDraft(Object.fromEntries(res.data.capacity.map((r) => [r.slotId, r.capacity])));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, date, reloadKey]);

  // Drops this date's override for one timeframe so it uses the default again.
  const resetToDefault = async (slotId: string) => {
    if (saveState === "saving") return;
    setSaveState("saving");
    setSaveError("");
    try {
      await api.delete(`/marketplace/vendor/${businessId}/capacity`, { params: { slotId, date } });
      await load(date);
    } catch {
      setSaveError("Couldn't reset that timeframe. Please try again.");
    } finally {
      setSaveState("idle");
    }
  };

  const isDirty = rows.some((row) => draft[row.slotId] !== row.capacity);

  const saveAll = async () => {
    if (saveState === "saving") return; // guards against double-submit on repeated clicks
    setSaveState("saving");
    setSaveError("");
    try {
      const changed = rows.filter((row) => draft[row.slotId] !== row.capacity);
      for (const row of changed) {
        await api.put(`/marketplace/vendor/${businessId}/capacity`, { slotId: row.slotId, capacity: draft[row.slotId], date });
      }
      await load(date);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveError("Couldn't save capacity. Please try again.");
      setSaveState("idle");
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
    return <p className="text-sm text-gray-500 py-4">Couldn&apos;t load delivery capacity.</p>;
  }

  return (
    <div className="space-y-4">
      <DeliveryDatePicker value={date} onChange={setDate} disabled={saveState === "saving"} />
      <p className="text-xs text-gray-500">
        Saving here sets the capacity for <strong>this date only</strong>. Your default for other days is not changed.
      </p>
      {rows.length > 0 && rows[0].dateAvailable === false && (
        <p role="status" className="text-xs p-2.5 rounded-lg bg-amber-50 text-amber-800">
          You don&apos;t deliver on this date (see your delivery schedule above), so customers can&apos;t book it whatever the numbers below say.
        </p>
      )}

      <div className="space-y-2">
        {rows.map((row) => {
          const value = draft[row.slotId] ?? row.capacity;
          const remaining = Math.max(0, value - row.booked);
          return (
            <div key={row.slotId} className="flex flex-wrap items-center gap-3 bg-gray-50 rounded-xl p-3">
              <div className="min-w-[140px]">
                <p className="font-medium text-gray-900 text-sm">{row.slotLabel}</p>
                <p className="text-xs text-gray-500">
                  {row.paid ?? row.booked} paid
                  {(row.reserved ?? 0) > 0 && ` · ${row.reserved} awaiting payment`} · {remaining} remaining
                  {row.overrideCapacity === null && <span className="text-gray-500"> · using default ({row.defaultCapacity})</span>}
                </p>
                {row.booked > value && <p className="text-xs text-amber-700">Over capacity — existing orders are kept; new bookings are stopped.</p>}
                {row.overrideCapacity !== null && (
                  <button type="button" disabled={saveState === "saving"} onClick={() => resetToDefault(row.slotId)} className="text-xs font-semibold text-purple-700 hover:text-purple-900 disabled:opacity-50">
                    Use default ({row.defaultCapacity})
                  </button>
                )}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto">
                Max orders
                <input
                  type="number"
                  min={0}
                  value={value}
                  disabled={saveState === "saving"}
                  onChange={(e) => setDraft((d) => ({ ...d, [row.slotId]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) }))}
                  className="w-20 px-2 py-1.5 border border-gray-400 bg-white text-gray-900 rounded-lg text-sm"
                />
              </label>
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-gray-500">No delivery timeframes are configured yet.</p>}
      </div>

      {saveError && <div className="text-sm p-2.5 rounded-lg text-red-700 bg-red-100">{saveError}</div>}

      {rows.length > 0 && (
        <button
          type="button"
          disabled={!isDirty || saveState === "saving"}
          onClick={saveAll}
          className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
            saveState === "saved" ? "bg-green-50 text-green-700" : "bg-purple-600 hover:bg-purple-700 text-white"
          }`}
        >
          {saveState === "saving" && <Loader2 size={14} className="animate-spin" />}
          {saveState === "saved" && <CheckCircle2 size={14} />}
          {saveState === "idle" && <Save size={14} />}
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved successfully" : "Save Capacity"}
        </button>
      )}
    </div>
  );
}

export default function VendorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const vendor = useVendorContext();
  // Bumped when the schedule changes, so the capacity section re-reads availability.
  const [scheduleVersion, setScheduleVersion] = useState(0);
  const [form, setForm] = useState<VendorFormValues | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pauseBusy, setPauseBusy] = useState(false);
  // Seeded once from context on this component's first render — by the
  // time VendorApprovalGate renders this page at all, `vendor` is already
  // loaded and stable for the page's lifetime (the gate doesn't re-fetch
  // on its own), so a plain useState initializer is sufficient; local
  // edits (save/pause below) update `current` directly rather than
  // syncing it from context in an effect.
  const [current, setCurrent] = useState<VendorProfile | null>(vendor);

  if (!current) return null;

  const startEditing = () => {
    setForm(formFromVendor(current));
    setError("");
    setEditing(true);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const res = await api.patch<{ vendor: VendorProfile }>(`/marketplace/vendor/${id}/profile`, form);
      setCurrent((prev) => (prev ? { ...prev, ...res.data.vendor } : prev));
      setEditing(false);
    } catch (err) {
      setError((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  };

  const togglePause = async () => {
    setPauseBusy(true);
    try {
      if (current.paused) {
        await api.delete(`/marketplace/vendor/${id}/pause`);
      } else {
        const reason = window.prompt("Reason for pausing (optional):") ?? undefined;
        await api.post(`/marketplace/vendor/${id}/pause`, { reason });
      }
      setCurrent((prev) => (prev ? { ...prev, paused: !prev.paused } : prev));
    } finally {
      setPauseBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Vendor Profile</h1>
        {!editing && (
          <button
            type="button"
            onClick={startEditing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-semibold transition"
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
      </div>

      {current.paused && (
        <div className="text-sm p-3 rounded-lg text-amber-700 bg-amber-50">
          You&apos;re currently paused{current.pausedReason ? `: ${current.pausedReason}` : "."} — you won&apos;t receive new orders until you unpause.
        </div>
      )}

      {!editing ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-gray-600 text-xs">
              {current.secureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current.secureUrl} alt={current.name} className="w-full h-full object-cover" />
              ) : (
                "No image"
              )}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{current.name}</p>
              <p className="text-sm text-gray-500">{current.vendorCategory ?? "School Vendor"}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600">{current.description}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
            {current.location && <span>Location: {current.location}</span>}
            {current.availabilityStart && current.availabilityEnd && (
              <span className="flex items-center gap-1">
                <Clock size={12} /> {current.availabilityStart} – {current.availabilityEnd}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={pauseBusy}
            onClick={togglePause}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition disabled:opacity-50 ${
              current.paused ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
            }`}
          >
            {current.paused ? "Unpause vendor" : "Pause vendor"}
          </button>
        </div>
      ) : (
        form && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Vendor name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={saving}
                className="w-full px-4 py-2.5 border border-gray-400 bg-white text-gray-900 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
              <select
                value={form.vendorCategory}
                onChange={(e) => setForm({ ...form, vendorCategory: e.target.value })}
                disabled={saving}
                className="w-full px-4 py-2.5 border border-gray-400 bg-white text-gray-900 rounded-xl text-sm"
              >
                {VENDOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                disabled={saving}
                className="w-full px-4 py-2.5 border border-gray-400 bg-white text-gray-900 rounded-xl text-sm resize-none"
              />
            </div>
            <ImageUploadField
              secureUrl={form.secureUrl}
              disabled={saving}
              onUploaded={({ publicId, secureUrl }) => setForm({ ...form, publicId, secureUrl })}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Location <span className="text-gray-500 font-normal">(where deliverers collect orders)</span>
              </label>
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                disabled={saving}
                placeholder="e.g. Block C, Female Hostel"
                className="w-full px-4 py-2.5 border border-gray-400 bg-white text-gray-900 rounded-xl text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Available from</label>
                <input
                  type="time"
                  value={form.availabilityStart}
                  onChange={(e) => setForm({ ...form, availabilityStart: e.target.value })}
                  disabled={saving}
                  className="w-full px-4 py-2.5 border border-gray-400 bg-white text-gray-900 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Available until</label>
                <input
                  type="time"
                  value={form.availabilityEnd}
                  onChange={(e) => setForm({ ...form, availabilityEnd: e.target.value })}
                  disabled={saving}
                  className="w-full px-4 py-2.5 border border-gray-400 bg-white text-gray-900 rounded-xl text-sm"
                />
              </div>
            </div>

            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2 pt-2">
              <Wallet size={16} className="text-gray-500" />
              Payout bank details
            </h3>
            <BankDetailsFields value={form} disabled={saving} onChange={(bankDetails) => setForm({ ...form, ...bankDetails })} />

            {error && <div className="text-sm p-3 rounded-lg text-red-700 bg-red-100">{error}</div>}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-semibold transition disabled:opacity-50"
              >
                <X size={14} />
                Cancel
              </button>
            </div>
          </div>
        )
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Delivery Schedule</h2>
        <p className="text-xs text-gray-500 mb-4">Choose the days you deliver, and close or add individual dates.</p>
        <DeliveryScheduleSection businessId={id} onChanged={() => setScheduleVersion((v) => v + 1)} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Set Product Deliveries Per Time Range</h2>
        <p className="text-xs text-gray-500 mb-4">
          The maximum number of customer orders you can fulfil during each delivery timeframe. This is independent
          of deliverer scheduling — it&apos;s only about how many orders you can prepare.
        </p>
        <CapacitySection businessId={id} reloadKey={scheduleVersion} />
      </div>

      {current.approvalStatus === "APPROVED" && (
        <p className="text-xs text-green-700 flex items-center gap-1">
          <CheckCircle2 size={13} /> Approved and live on the marketplace
        </p>
      )}
      {!error && !editing && !current.location && (
        <p className="text-xs text-amber-700 flex items-center gap-1">
          <AlertCircle size={13} /> Add a location so deliverers know where to collect orders.
        </p>
      )}
    </div>
  );
}
