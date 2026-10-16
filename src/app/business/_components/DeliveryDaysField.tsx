// src/app/business/_components/DeliveryDaysField.tsx
//
// The delivery-days dropdown for the business onboarding/edit form — see
// docs/marketplace/data/delivery-days.md. "Delivery days" means days of
// the week the business accepts deliveries on, NOT "N days from today."
// Up to MAX_DELIVERY_DAYS may be selected; RECOMMENDED_MAX_DELIVERY_DAYS
// is called out so businesses don't over-commit and run short on prep time.

"use client";

import { MAX_DELIVERY_DAYS, RECOMMENDED_MAX_DELIVERY_DAYS, type DeliveryDay } from "@/types/business";

const DAY_OPTIONS: { value: DeliveryDay; label: string }[] = [
  { value: "MONDAY", label: "Monday" },
  { value: "TUESDAY", label: "Tuesday" },
  { value: "WEDNESDAY", label: "Wednesday" },
  { value: "THURSDAY", label: "Thursday" },
  { value: "FRIDAY", label: "Friday" },
  { value: "SATURDAY", label: "Saturday" },
  { value: "SUNDAY", label: "Sunday" },
];

interface DeliveryDaysFieldProps {
  value: DeliveryDay[];
  onChange: (days: DeliveryDay[]) => void;
  disabled?: boolean;
}

export default function DeliveryDaysField({ value, onChange, disabled }: DeliveryDaysFieldProps) {
  const atLimit = value.length >= MAX_DELIVERY_DAYS;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5" htmlFor="deliveryDaySelect">
        Delivery days <span className="text-gray-500 font-normal">(days of the week — up to {MAX_DELIVERY_DAYS})</span>
      </label>
      <p className="text-xs text-gray-500 mb-2">
        We recommend {RECOMMENDED_MAX_DELIVERY_DAYS} or fewer, so you have enough time to prepare orders.
      </p>

      <select
        id="deliveryDaySelect"
        value=""
        disabled={disabled || atLimit}
        onChange={(e) => {
          const day = e.target.value as DeliveryDay;
          if (day && !value.includes(day)) onChange([...value, day]);
        }}
        className="w-full px-4 py-3 border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition disabled:opacity-60"
      >
        <option value="" disabled>
          {atLimit ? `You've selected ${MAX_DELIVERY_DAYS} days` : "Add a delivery day…"}
        </option>
        {DAY_OPTIONS.filter((option) => !value.includes(option.value)).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {value.map((day) => {
            const label = DAY_OPTIONS.find((option) => option.value === day)?.label ?? day;
            return (
              <span
                key={day}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium"
              >
                {label}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((d) => d !== day))}
                    aria-label={`Remove ${label}`}
                    className="hover:text-blue-900"
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
