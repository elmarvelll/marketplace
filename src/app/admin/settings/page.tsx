// src/app/admin/settings/page.tsx
//
// Admin-only form for the Marketplace's operational settings: the two
// time windows (Seller Drop-off, Deliverer Handoff) and the central
// drop-off location string. Backed by GET/PUT /marketplace/admin/settings
// — see services/marketplace/admin/shared/marketplace-settings.ts. Chrome
// (navbar + admin tab menu) comes from ../layout.tsx.

"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, Loader2 } from "lucide-react";
import api from "@/lib/axios";

interface SettingsDto {
  dropoffWindowStart: string;
  dropoffWindowEnd: string;
  handoffWindowStart: string;
  handoffWindowEnd: string;
  dropoffLocation: string | null;
  // School Vendor fields — see
  // services/marketplace/admin/shared/marketplace-settings.ts.
  dropoffLocationName: string | null;
  dropoffLocationInstructions: string | null;
  dropoffLocationActive: boolean;
  vendorDeliveryFee: number;
  vendorServiceFeeAmount: number;
  delivererPayoutAmount: number;
  updatedAt: string;
}

export default function AdminSettingsPage() {
  const [form, setForm] = useState<SettingsDto | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoadState("loading");
    try {
      const res = await api.get<SettingsDto>("/marketplace/admin/settings");
      setForm(res.data);
      setLoadState("loaded");
    } catch (err) {
      setLoadState(isAxiosError(err) && err.response?.status === 403 ? "forbidden" : "error");
    }
  };

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, []);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await api.put<SettingsDto>("/marketplace/admin/settings", {
        dropoffWindowStart: form.dropoffWindowStart,
        dropoffWindowEnd: form.dropoffWindowEnd,
        handoffWindowStart: form.handoffWindowStart,
        handoffWindowEnd: form.handoffWindowEnd,
        dropoffLocation: form.dropoffLocation,
        dropoffLocationName: form.dropoffLocationName,
        dropoffLocationInstructions: form.dropoffLocationInstructions,
        dropoffLocationActive: form.dropoffLocationActive,
        vendorDeliveryFee: form.vendorDeliveryFee,
        vendorServiceFeeAmount: form.vendorServiceFeeAmount,
        delivererPayoutAmount: form.delivererPayoutAmount,
      });
      setForm(res.data);
      setMessage("Saved.");
    } catch (err) {
      setMessage((isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (loadState === "forbidden" || loadState === "error" || !form) {
    return (
      <div className="flex flex-col items-center text-center py-24 px-4">
        <AlertCircle size={28} className="text-gray-500 mb-3" />
        <p className="text-gray-500">{loadState === "forbidden" ? "Admin access required." : "Couldn't load settings."}</p>
      </div>
    );
  }

  const inputClass =
    "w-full px-4 py-2.5 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500";

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
      <p className="text-sm text-gray-500 mb-6">Operational windows and the central drop-off location.</p>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Drop-off location</label>
          <input
            type="text"
            placeholder="e.g. Student Center, Room 12"
            value={form.dropoffLocation ?? ""}
            onChange={(e) => setForm({ ...form, dropoffLocation: e.target.value })}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Drop-off window start</label>
            <input
              type="text"
              placeholder="HH:MM"
              value={form.dropoffWindowStart}
              onChange={(e) => setForm({ ...form, dropoffWindowStart: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Drop-off window end</label>
            <input
              type="text"
              placeholder="HH:MM"
              value={form.dropoffWindowEnd}
              onChange={(e) => setForm({ ...form, dropoffWindowEnd: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Handoff window start</label>
            <input
              type="text"
              placeholder="HH:MM"
              value={form.handoffWindowStart}
              onChange={(e) => setForm({ ...form, handoffWindowStart: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Handoff window end</label>
            <input
              type="text"
              placeholder="HH:MM"
              value={form.handoffWindowEnd}
              onChange={(e) => setForm({ ...form, handoffWindowEnd: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {message && <span className="text-sm text-gray-500">{message}</span>}
        </div>
      </div>

      <h2 className="text-lg font-bold text-gray-900 mt-8 mb-1">School Vendor</h2>
      <p className="text-sm text-gray-500 mb-4">Fees are snapshotted onto each booking — changing these never alters past orders.</p>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Delivery fee (₦)</label>
            <input
              type="number"
              min={0}
              value={form.vendorDeliveryFee}
              onChange={(e) => setForm({ ...form, vendorDeliveryFee: Number(e.target.value) })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Service fee per item (₦)</label>
            <input
              type="number"
              min={0}
              value={form.vendorServiceFeeAmount}
              onChange={(e) => setForm({ ...form, vendorServiceFeeAmount: Number(e.target.value) })}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Deliverer payout per handoff (₦)</label>
          <input
            type="number"
            min={0}
            value={form.delivererPayoutAmount}
            onChange={(e) => setForm({ ...form, delivererPayoutAmount: Number(e.target.value) })}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Central drop-off name</label>
          <input
            type="text"
            placeholder="e.g. Vendor Collection Point"
            value={form.dropoffLocationName ?? ""}
            onChange={(e) => setForm({ ...form, dropoffLocationName: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Drop-off instructions</label>
          <textarea
            rows={3}
            placeholder="How vendors/deliverers should use this point"
            value={form.dropoffLocationInstructions ?? ""}
            onChange={(e) => setForm({ ...form, dropoffLocationInstructions: e.target.value })}
            className={inputClass}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="w-4 h-4 accent-blue-600"
            checked={form.dropoffLocationActive}
            onChange={(e) => setForm({ ...form, dropoffLocationActive: e.target.checked })}
          />
          Drop-off point active
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
