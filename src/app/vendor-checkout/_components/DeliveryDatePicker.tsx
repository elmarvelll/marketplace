// .../vendor-checkout/_components/DeliveryDatePicker.tsx
//
// "Delivery Date" picker (spec §4-6): Today / Tomorrow / Choose custom
// date. Defaults to today wherever it's mounted (the parent seeds `value`
// with todayIsoDate() on first render — see spec §5). Shared between the
// customer's Vendor checkout page and the vendor's own capacity editor
// (spec §3's "same principle should apply to any similar capacity-editing
// interface" — both need the same Today/Tomorrow/custom shape). The
// backend is always the authority on validity (parseAndValidateDeliveryDate)
// — this component only offers a sane, bounded range so a customer/vendor
// rarely hits a rejection at all.

"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";

const MAX_ADVANCE_DAYS = 7; // mirrors MAX_ADVANCE_BOOKING_DAYS in validate-delivery-date.ts

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function todayIsoDate(): string {
  return toIsoDate(new Date());
}

const dayFormatter = new Intl.DateTimeFormat("en-NG", { month: "long", day: "numeric" });

interface DeliveryDatePickerProps {
  value: string; // "YYYY-MM-DD"
  onChange: (date: string) => void;
  disabled?: boolean;
  // When provided (customer checkout), the server's view of the booking
  // window: only `selectable` dates can be picked, the rest are shown
  // disabled with the reason. Omitted on the vendor's own capacity editor,
  // which keeps the free Today / Tomorrow / custom picker below.
  dates?: { date: string; selectable: boolean; reason: string }[];
}

const REASON_LABEL: Record<string, string> = {
  not_delivering: "No delivery",
  fully_booked: "Fully booked",
  closed_for_today: "Closed",
};
const chipFormatter = new Intl.DateTimeFormat("en-NG", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export default function DeliveryDatePicker({ value, onChange, disabled, dates }: DeliveryDatePickerProps) {
  if (dates) return <AvailableDateChips value={value} onChange={onChange} disabled={disabled} dates={dates} />;
  return <FreeDatePicker value={value} onChange={onChange} disabled={disabled} />;
}

// Customer checkout: one chip per date in the booking window. Unavailable
// dates stay visible but disabled, so it's clear why they can't be chosen.
function AvailableDateChips({ value, onChange, disabled, dates }: Required<Pick<DeliveryDatePickerProps, "dates">> & DeliveryDatePickerProps) {
  const anySelectable = dates.some((d) => d.selectable);
  return (
    <div>
      <p id="delivery-date-label" className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <CalendarDays size={13} /> Delivery date
      </p>
      <div role="radiogroup" aria-labelledby="delivery-date-label" className="flex flex-wrap gap-2">
        {dates.map((d, index) => {
          const selected = d.date === value;
          const label = index === 0 ? "Today" : index === 1 ? "Tomorrow" : chipFormatter.format(new Date(`${d.date}T00:00:00Z`));
          return (
            <button
              key={d.date}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled || !d.selectable}
              onClick={() => onChange(d.date)}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition text-left disabled:cursor-not-allowed ${
                selected && d.selectable
                  ? "bg-purple-600 border-purple-600 text-white"
                  : d.selectable
                    ? "border-gray-200 text-gray-700 hover:bg-gray-50"
                    : "border-gray-100 bg-gray-50 text-gray-500"
              }`}
            >
              <span className="block">{label}</span>
              {!d.selectable && <span className="block text-[11px] font-normal">{REASON_LABEL[d.reason] ?? "Unavailable"}</span>}
            </button>
          );
        })}
      </div>
      {!anySelectable && (
        <p role="status" className="mt-2 text-sm text-amber-700">
          No delivery dates are available for the vendors in your cart right now. Please check back later.
        </p>
      )}
    </div>
  );
}

function FreeDatePicker({ value, onChange, disabled }: DeliveryDatePickerProps) {
  const today = new Date();
  const todayIso = toIsoDate(today);
  const tomorrowIso = toIsoDate(addDays(today, 1));
  const maxIso = toIsoDate(addDays(today, MAX_ADVANCE_DAYS));

  const isCustomSelected = value !== todayIso && value !== tomorrowIso;
  const [customOpen, setCustomOpen] = useState(isCustomSelected);

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <CalendarDays size={13} /> Delivery date
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setCustomOpen(false);
            onChange(todayIso);
          }}
          className={`px-4 py-2 rounded-xl text-sm font-medium border transition disabled:opacity-50 ${
            value === todayIso && !customOpen ? "bg-purple-600 border-purple-600 text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"
          }`}
        >
          Today — {dayFormatter.format(today)}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setCustomOpen(false);
            onChange(tomorrowIso);
          }}
          className={`px-4 py-2 rounded-xl text-sm font-medium border transition disabled:opacity-50 ${
            value === tomorrowIso && !customOpen ? "bg-purple-600 border-purple-600 text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"
          }`}
        >
          Tomorrow — {dayFormatter.format(addDays(today, 1))}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setCustomOpen(true)}
          className={`px-4 py-2 rounded-xl text-sm font-medium border transition disabled:opacity-50 ${
            customOpen ? "bg-purple-600 border-purple-600 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          Choose custom date
        </button>
      </div>
      {customOpen && (
        <input
          type="date"
          value={isCustomSelected ? value : ""}
          min={todayIso}
          max={maxIso}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          className="mt-2 px-3 py-2 border border-gray-400 bg-white rounded-xl text-sm text-gray-900 disabled:opacity-50"
        />
      )}
    </div>
  );
}
