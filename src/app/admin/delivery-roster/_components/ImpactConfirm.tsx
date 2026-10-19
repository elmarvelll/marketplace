// src/app/admin/delivery-roster/_components/ImpactConfirm.tsx
//
// Shown when a roster change would affect deliveries already booked. Lists exactly what's affected and asks for the
// two explicit decisions the server requires: keep over-capacity deliveries (nothing is ever dropped) and what to do
// with deliveries planned from the roster (re-plan to the new roster, or keep their current deliverer).

"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { RosterImpact } from "./roster-types";
import { formatDay } from "./roster-types";
import type { ChangeDecision } from "./useRosterChange";

export default function ImpactConfirm({
  impact,
  saving,
  onConfirm,
  onCancel,
}: {
  impact: RosterImpact;
  saving: boolean;
  onConfirm: (decision: ChangeDecision) => void;
  onCancel: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [planResolution, setPlanResolution] = useState<"replan" | "keep" | "">("");
  const needsAck = impact.overCapacity.length > 0;
  const needsPlan = impact.replans.length > 0;
  const ready = (!needsAck || acknowledged) && (!needsPlan || planResolution !== "");

  return (
    <div role="alertdialog" aria-labelledby="impact-title" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-4">
      <p id="impact-title" className="flex items-center gap-2 font-semibold text-amber-900">
        <AlertTriangle size={16} /> This change affects deliveries that are already booked
      </p>

      {needsAck && (
        <div className="space-y-2">
          <p className="text-sm text-amber-900">These slot occurrences would have more deliveries booked than the new limit allows:</p>
          <ul className="text-sm text-gray-900 space-y-1">
            {impact.overCapacity.map((o) => (
              <li key={`${o.slotId}-${o.date}`}>
                {formatDay(o.date)} · {o.slotLabel}: <strong>{o.booked}</strong> booked, new limit <strong>{o.newLimit}</strong>
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2 text-sm text-gray-900">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 w-4 h-4 accent-blue-600" />
            Keep those deliveries as they are (nothing is cancelled or moved) and stop new bookings until they&apos;re under the limit.
          </label>
        </div>
      )}

      {needsPlan && (
        <fieldset className="space-y-2">
          <legend className="text-sm text-amber-900 mb-1">These deliveries were planned from the roster and their planned deliverer would no longer be on it:</legend>
          <ul className="text-sm text-gray-900 space-y-1">
            {impact.replans.map((r) => (
              <li key={r.scheduledDeliveryId}>
                {formatDay(r.date)} · {r.slotLabel} — planned: {r.plannedDeliverer ?? "nobody"}
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-sm text-gray-900">
            <input type="radio" name="plan-resolution" checked={planResolution === "replan"} onChange={() => setPlanResolution("replan")} className="w-4 h-4 accent-blue-600" />
            Re-plan them to the updated roster
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-900">
            <input type="radio" name="plan-resolution" checked={planResolution === "keep"} onChange={() => setPlanResolution("keep")} className="w-4 h-4 accent-blue-600" />
            Keep their current planned deliverer
          </label>
        </fieldset>
      )}

      {impact.unchanged.length > 0 && (
        <p className="text-xs text-gray-700">
          {impact.unchanged.length} other delivery(ies) on these dates were planned by hand or are already assigned — they won&apos;t be changed.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!ready || saving}
          onClick={() => onConfirm({ acknowledgeOverCapacity: needsAck ? acknowledged : undefined, planResolution: needsPlan ? (planResolution as "replan" | "keep") : undefined })}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-40"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Confirm and save
        </button>
        <button type="button" disabled={saving} onClick={onCancel} className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-white transition">
          Go back
        </button>
      </div>
    </div>
  );
}
