// services/marketplace/vendor-delivery/deliverer-arrival.ts
//
// The single source of truth for "when must a deliverer arrive" (spec
// §19: 30 minutes before their assigned delivery timeframe — 5-6PM ->
// 4:30PM, 6-7PM -> 5:30PM, 7-8PM -> 6:30PM). A fixed rule per the spec's
// own wording ("maintain the existing requirement"), not admin-configurable
// — deliberately NOT VendorDeliverySlot.vendorPrepDeadlineMins, which is a
// different, independently-configurable concept (when the VENDOR must
// have the order ready), even though both currently default to 30. Used
// by the admin roster (manage-roster.ts) and the deliverer's own
// dashboard so the two can never show a different arrival time for the
// same slot.

export const DELIVERER_ARRIVAL_LEAD_MINS = 30;

// windowStart: "HH:MM" -> the required arrival time, also "HH:MM".
export function formatArrivalTime(windowStart: string): string {
  const [hour, minute] = windowStart.split(":").map(Number);
  const totalMinutes = hour * 60 + minute - DELIVERER_ARRIVAL_LEAD_MINS;
  const arrivalHour = Math.floor(((totalMinutes % 1440) + 1440) % 1440 / 60);
  const arrivalMinute = ((totalMinutes % 60) + 60) % 60;
  return `${String(arrivalHour).padStart(2, "0")}:${String(arrivalMinute).padStart(2, "0")}`;
}
