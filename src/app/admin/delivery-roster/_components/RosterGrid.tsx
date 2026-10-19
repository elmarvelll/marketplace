// src/app/admin/delivery-roster/_components/RosterGrid.tsx
//
// The recurring weekly roster: Monday..Sunday as columns, time slots as rows, one button per cell. Each cell shows its
// weekly deliverers and limit (the template) and its next upcoming occurrence's bookings and status. Pure and
// presentational — the page owns data and the editor.
//
// Tablet/desktop (md+) get the full grid, scrolling sideways inside its own box when narrow; phones get a day picker
// and that day's slots as full-width cards, so nothing is crammed into seven tiny columns.

import { AlertCircle, CalendarClock, UserX } from "lucide-react";
import type { RosterCellView, RosterSlot, RosterWeekView } from "./roster-types";
import { STATUS_LABELS, STATUS_STYLES, formatDay, limitText, slotWindow } from "./roster-types";

function CellBody({ cell }: { cell: RosterCellView }) {
  const { upcoming } = cell;
  return (
    <>
      {cell.deliverers.length === 0 ? (
        <span className="flex items-center gap-1 text-xs font-semibold text-amber-800">
          <UserX size={12} aria-hidden /> Unassigned
        </span>
      ) : (
        <span className="block text-xs font-medium text-gray-900 break-words">
          {cell.deliverers.map((d, i) => (
            <span key={d.id} className={d.status === "APPROVED" ? "" : "text-red-700"}>
              {i > 0 ? ", " : ""}
              {d.name}
              {d.status === "APPROVED" ? "" : ` (${d.status.toLowerCase()})`}
            </span>
          ))}
        </span>
      )}
      <span className="block text-[11px] text-gray-600 mt-0.5">
        {limitText(cell.effectiveMax)}
        {cell.maxDeliveries === null && cell.effectiveMax !== null ? " (default)" : ""}
      </span>
      <span className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${STATUS_STYLES[upcoming.status]}`}>{STATUS_LABELS[upcoming.status]}</span>
        {upcoming.hasException && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200">Exception</span>}
        {upcoming.staff.length === 0 && cell.deliverers.length > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200">Unstaffed</span>
        )}
      </span>
      <span className="block text-[11px] text-gray-700 mt-1">
        {upcoming.limit === null ? `${upcoming.booked} booked` : `${upcoming.booked}/${upcoming.limit} booked`}
        {upcoming.pending > 0 ? ` · ${upcoming.pending} awaiting payment` : ""}
      </span>
      {upcoming.overCapacity && (
        <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-red-700">
          <AlertCircle size={11} aria-hidden /> Over limit
        </span>
      )}
    </>
  );
}

function cellLabel(slot: RosterSlot, dayName: string, cell: RosterCellView) {
  const staff = cell.deliverers.length ? cell.deliverers.map((d) => d.name).join(", ") : "unassigned";
  return `Edit ${dayName} ${slot.label}: ${staff}, ${limitText(cell.effectiveMax).toLowerCase()}, ${STATUS_LABELS[cell.upcoming.status].toLowerCase()}`;
}

export default function RosterGrid({
  week,
  onSelectCell,
  mobileWeekday,
  onMobileWeekday,
}: {
  week: RosterWeekView;
  onSelectCell: (slotId: string, weekday: number) => void;
  mobileWeekday: number;
  onMobileWeekday: (weekday: number) => void;
}) {
  const cellOf = (slotId: string, weekday: number) => week.cells.find((c) => c.slotId === slotId && c.weekday === weekday)!;

  if (week.slots.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-12 px-4 bg-white rounded-2xl border border-gray-100">
        <CalendarClock size={26} className="text-gray-500 mb-2" aria-hidden />
        <p className="text-sm text-gray-700">No active time slots for this roster yet.</p>
        <p className="text-xs text-gray-500 mt-1">
          {week.operation === "MARKETPLACE" ? "Add one under Settings & slots." : "Add or activate one on Admin → Vendor Delivery."}
        </p>
      </div>
    );
  }

  const mobileDay = week.days.find((d) => d.weekday === mobileWeekday) ?? week.days[0];

  return (
    <div data-testid="roster-grid">
      {/* Tablet / desktop: the full week. */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full min-w-[920px] border-collapse text-left">
          <caption className="sr-only">Weekly delivery roster: days as columns, time slots as rows</caption>
          <thead>
            <tr className="bg-gray-50">
              <th scope="col" className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 w-36">
                Time slot
              </th>
              {week.days.map((day) => (
                <th key={day.weekday} scope="col" className="px-2 py-2 text-xs font-semibold text-gray-700">
                  <span className="block">{day.name}</span>
                  <span className="block font-normal text-gray-500">Next: {formatDay(day.date, { day: "numeric", month: "short" })}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {week.slots.map((slot) => (
              <tr key={slot.id} className="border-t border-gray-100 align-top">
                <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-xs font-semibold text-gray-900 w-36">
                  <span className="block">{slot.label}</span>
                  <span className="block font-normal text-gray-500">{slotWindow(slot)}</span>
                  <span className="block font-normal text-gray-500">{slot.staffPositions} position(s)</span>
                </th>
                {week.days.map((day) => {
                  const cell = cellOf(slot.id, day.weekday);
                  return (
                    <td key={day.weekday} className="p-1">
                      <button
                        type="button"
                        onClick={() => onSelectCell(slot.id, day.weekday)}
                        aria-label={cellLabel(slot, day.name, cell)}
                        data-cell={`${slot.id}:${day.weekday}`}
                        className={`w-full h-full min-h-[104px] text-left rounded-xl border p-2 transition hover:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          cell.deliverers.length === 0 ? "border-amber-300 bg-amber-50/40" : "border-gray-200 bg-white"
                        }`}
                      >
                        <CellBody cell={cell} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: one day at a time. */}
      <div className="md:hidden">
        <div role="tablist" aria-label="Day of the week" className="flex gap-1.5 overflow-x-auto pb-2 mb-2">
          {week.days.map((day) => (
            <button
              key={day.weekday}
              type="button"
              role="tab"
              aria-selected={day.weekday === mobileDay.weekday}
              onClick={() => onMobileWeekday(day.weekday)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition ${
                day.weekday === mobileDay.weekday ? "bg-blue-600 text-white" : "bg-white border border-gray-300 text-gray-700"
              }`}
            >
              {day.name.slice(0, 3)}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mb-2">
          Every {mobileDay.name} · next on {formatDay(mobileDay.date, { day: "numeric", month: "long" })}
        </p>
        <div className="space-y-2">
          {week.slots.map((slot) => {
            const cell = cellOf(slot.id, mobileDay.weekday);
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => onSelectCell(slot.id, mobileDay.weekday)}
                aria-label={cellLabel(slot, mobileDay.name, cell)}
                className={`w-full text-left rounded-2xl border p-3 bg-white ${cell.deliverers.length === 0 ? "border-amber-300" : "border-gray-200"}`}
              >
                <span className="block text-sm font-semibold text-gray-900">{slot.label}</span>
                <span className="block text-xs text-gray-500 mb-1.5">{slotWindow(slot)}</span>
                <CellBody cell={cell} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
