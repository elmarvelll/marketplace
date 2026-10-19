// src/app/admin/delivery-roster/page.tsx
//
// Admin -> Delivery Roster: the recurring weekly delivery roster for the central Marketplace operation and for the
// Vendor Market, configured once and reused every week. Weekly grid (staff + max deliveries per weekday/slot), a date
// view for one-off exceptions and the deliveries booked into each slot, and the roster's settings and slots. Every API
// call is admin-gated server-side (requireAdmin); this page is navigation, not the security boundary. See
// services/marketplace/delivery-roster/ and EXTRACTION_REPORT.md ("Recurring delivery rosters").

"use client";

import { useCallback, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import api from "@/lib/axios";
import RosterGrid from "./_components/RosterGrid";
import CellEditor from "./_components/CellEditor";
import DateView from "./_components/DateView";
import RosterSettings from "./_components/RosterSettings";
import type { Operation, RosterWeekView } from "./_components/roster-types";
import { OPERATION_LABELS } from "./_components/roster-types";

type Tab = "week" | "date" | "settings";
const TABS: { key: Tab; label: string }[] = [
  { key: "week", label: "Weekly roster" },
  { key: "date", label: "Date view & exceptions" },
  { key: "settings", label: "Settings & slots" },
];

export default function AdminDeliveryRosterPage() {
  const [operation, setOperation] = useState<Operation>("MARKETPLACE");
  const [tab, setTab] = useState<Tab>("week");
  const [week, setWeek] = useState<RosterWeekView | null>(null);
  const [state, setState] = useState<"loading" | "loaded" | "forbidden" | "error">("loading");
  const [editing, setEditing] = useState<{ slotId: string; weekday: number } | null>(null);
  // Phones show one day at a time; 0 = not chosen yet (opens on today's weekday).
  const [mobileWeekday, setMobileWeekday] = useState(0);
  const [flash, setFlash] = useState("");

  const load = useCallback(async (op: Operation) => {
    setState("loading");
    try {
      const res = await api.get<{ roster: RosterWeekView }>("/marketplace/admin/delivery-roster", { params: { operation: op } });
      setWeek(res.data.roster);
      const roster = res.data.roster;
      setMobileWeekday((current) => current || (roster.days.find((d) => d.date === roster.today)?.weekday ?? 1));
      setState("loaded");
    } catch (err) {
      setState(isAxiosError(err) && err.response?.status === 403 ? "forbidden" : "error");
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await load(operation);
    };
    run();
  }, [operation, load]);

  const saved = (message: string) => {
    setFlash(message);
    setEditing(null);
    void load(operation);
  };

  const editingSlot = editing && week?.slots.find((s) => s.id === editing.slotId);
  const editingCell = editing && week?.cells.find((c) => c.slotId === editing.slotId && c.weekday === editing.weekday);
  const editingDay = editing && week?.days.find((d) => d.weekday === editing.weekday);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Delivery Roster</h1>
      <p className="text-sm text-gray-500 mb-5">
        Set who delivers each time slot on each day of the week and how many deliveries each slot may take. It repeats every week; use the date view
        for one-off changes. Checkout and delivery planning follow it automatically{week ? ` (times are ${week.timezone})` : ""}.
      </p>

      <div role="radiogroup" aria-label="Delivery operation" className="inline-flex flex-wrap rounded-xl border border-gray-300 bg-white p-1 mb-4">
        {(["MARKETPLACE", "VENDOR"] as Operation[]).map((op) => (
          <button
            key={op}
            type="button"
            role="radio"
            aria-checked={operation === op}
            onClick={() => {
              setOperation(op);
              setEditing(null);
              setFlash("");
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${operation === op ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}
          >
            {OPERATION_LABELS[op]}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        {operation === "MARKETPLACE"
          ? "Business orders, collected at the central drop-off point. Business buyers don't pick a slot — checkout books the earliest slot with room on the seller's delivery days."
          : "School Vendor orders. Customers pick a delivery date and timeframe at Vendor checkout; this limit applies across all vendors, on top of each vendor's own capacity."}
      </p>

      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5" role="tablist" aria-label="Roster views">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition ${tab === t.key ? "bg-gray-900 text-white" : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {flash && (
        <div role="status" className="mb-4 flex items-start justify-between gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={14} /> {flash}
          </span>
          <button type="button" onClick={() => setFlash("")} aria-label="Dismiss" className="text-green-800">
            <X size={14} />
          </button>
        </div>
      )}

      {state === "loading" && !week && (
        <div className="flex justify-center py-24">
          <Loader2 size={28} className="animate-spin text-gray-500" />
        </div>
      )}
      {(state === "forbidden" || state === "error") && (
        <div className="flex flex-col items-center text-center py-24 px-4">
          <AlertCircle size={28} className="text-gray-500 mb-3" />
          <p className="text-gray-500">{state === "forbidden" ? "Admin access required." : "Couldn't load the roster."}</p>
          {state === "error" && (
            <button type="button" onClick={() => load(operation)} className="mt-3 px-4 py-2 rounded-xl border border-gray-300 text-sm text-gray-700 bg-white">
              Try again
            </button>
          )}
        </div>
      )}

      {week && week.operation === operation && state !== "forbidden" && state !== "error" && (
        <>
          {tab === "week" && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                <span>Default limit: <strong className="text-gray-900">{week.defaultMaxDeliveries === null ? "no limit" : week.defaultMaxDeliveries}</strong></span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" aria-hidden /> Available</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" aria-hidden /> Partially booked</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" aria-hidden /> Full</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" aria-hidden /> Unassigned</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" aria-hidden /> Exception</span>
                {state === "loading" && <Loader2 size={14} className="animate-spin text-gray-500" aria-label="Refreshing" />}
              </div>
              <RosterGrid week={week} onSelectCell={(slotId, weekday) => setEditing({ slotId, weekday })} mobileWeekday={mobileWeekday} onMobileWeekday={setMobileWeekday} />
              <p className="mt-3 text-xs text-gray-500">Booked counts are for each day&apos;s next date (shown under the day). Click a cell to change its deliverers or limit.</p>
            </>
          )}
          {tab === "date" && <DateView key={operation} operation={operation} initialDate={week.today} today={week.today} onSaved={saved} />}
          {tab === "settings" && <RosterSettings key={`${operation}-${week.defaultMaxDeliveries}`} operation={operation} defaultMax={week.defaultMaxDeliveries} onSaved={saved} />}
        </>
      )}

      {editing && editingSlot && editingCell && editingDay && week && (
        <CellEditor
          key={`${editing.slotId}-${editing.weekday}`}
          operation={operation}
          slot={editingSlot}
          dayName={editingDay.name}
          cell={editingCell}
          defaultMax={week.defaultMaxDeliveries}
          deliverers={week.deliverers}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
