// src/app/admin/deliverers/page.tsx
//
// Admin deliverer-application approval queue. Nested under
//  (not /admindashboard, which has no Marketplace
// tooling yet — see docs/marketplace/decisions/delivery-coordinator-is-admin.md)
// so it lives alongside the rest of the Marketplace UI; every API call
// here is still gated server-side by src/lib/admin.ts#requireAdmin
// regardless of how this URL is reached. Chrome (navbar + admin tab menu)
// comes from ../layout.tsx. See docs/marketplace/systems/deliverer-system.md.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import { AlertCircle, Loader2 } from "lucide-react";
import api from "@/lib/axios";

interface DelivererRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  hasPayoutAccount?: boolean;
  bankName?: string | null;
  accountHolderName?: string | null;
  accountNumberLast4?: string | null;
  // Location info (spec §69) — shown here since an admin reviewing an
  // application legitimately needs it.
  hall: string | null;
  room: string | null;
  preferredAvailability: string | null;
  status: string;
  appliedAt: string;
}

export default function AdminDeliverersPage() {
  const [deliverers, setDeliverers] = useState<DelivererRow[]>([]);
  const [slotLabels, setSlotLabels] = useState<Record<string, string>>({});
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Resolves the ranked, comma-separated slot ids stored on
  // Deliverer.preferredAvailability into "1st: X · 2nd: Y" — see
  // docs/marketplace/decisions/vendor-independent-architecture.md for why
  // the field is ranked, not an unordered set.
  const formatPreferences = (raw: string | null) => {
    if (!raw) return null;
    const ordinals = ["1st", "2nd", "3rd", "4th", "5th"];
    return raw
      .split(",")
      .filter(Boolean)
      .map((slotId, index) => `${ordinals[index] ?? `${index + 1}th`}: ${slotLabels[slotId] ?? "Unknown timeframe"}`)
      .join(" · ");
  };

  const load = async () => {
    setLoadState("loading");
    try {
      const [deliverersRes, slotsRes] = await Promise.all([
        api.get<{ deliverers: DelivererRow[] }>("/marketplace/admin/deliverers"),
        api.get<{ slots: { id: string; label: string }[] }>("/marketplace/admin/vendor-delivery/slots"),
      ]);
      setDeliverers(deliverersRes.data.deliverers);
      setSlotLabels(Object.fromEntries(slotsRes.data.slots.map((s) => [s.id, s.label])));
      setLoadState("loaded");
    } catch (err) {
      setLoadState(isAxiosError(err) && err.response?.status === 403 ? "forbidden" : "error");
    }
  };

  useEffect(() => {
    // Locally-defined wrapper (not just `load()` directly) — same
    // convention as src/app/_components/useCart.ts,
    // which this repo's stricter react-hooks/set-state-in-effect rule wants.
    const run = async () => {
      await load();
    };
    run();
  }, []);

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      await api.post(`/marketplace/admin/deliverers/${id}/approve`);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    const reason = window.prompt("Reason for rejecting this application:");
    if (!reason) return;
    setBusyId(id);
    try {
      await api.post(`/marketplace/admin/deliverers/${id}/reject`, { reason });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (loadState === "forbidden" || loadState === "error") {
    return (
      <div className="flex flex-col items-center text-center py-24 px-4">
        <AlertCircle size={28} className="text-gray-500 mb-3" />
        <p className="text-gray-500">{loadState === "forbidden" ? "Admin access required." : "Couldn't load applications."}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Deliverer applications</h1>
        <Link href="/admin/deliverers/assignments" className="text-sm font-medium text-blue-600 hover:text-blue-700">
          View assignments →
        </Link>
      </div>
      {deliverers.length === 0 ? (
        <p className="text-sm text-gray-500">No applications yet.</p>
      ) : (
        <div className="space-y-2">
          {deliverers.map((d) => (
            <div key={d.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-gray-900">
                  {d.firstName} {d.lastName}
                </p>
                <p className="text-xs text-gray-500">{d.email} {d.phone && `· ${d.phone}`}</p>
                <p className={`text-xs ${d.hasPayoutAccount ? "text-gray-500" : "text-amber-700"}`}>
                  {d.hasPayoutAccount ? `Payout: ${d.accountHolderName} · ${d.bankName} •••• ${d.accountNumberLast4}` : "No payout account — payouts are held"}
                </p>
                {(d.hall || d.room) && (
                  <p className="text-xs text-gray-500">
                    {[d.hall, d.room].filter(Boolean).join(", ")}
                  </p>
                )}
                {d.preferredAvailability && <p className="text-xs text-gray-500">Prefers: {formatPreferences(d.preferredAvailability)}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{d.status}</span>
                {d.status === "PENDING" && (
                  <>
                    <button
                      type="button"
                      disabled={busyId === d.id}
                      onClick={() => approve(d.id)}
                      className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === d.id}
                      onClick={() => reject(d.id)}
                      className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
