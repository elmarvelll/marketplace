// src/app/admin/delivery-roster/_components/roster-types.ts
//
// Client-side shapes of the Admin -> Delivery Roster API (services/marketplace/delivery-roster/roster-views.ts and
// roster-changes.ts). Types only — no server code is imported into the browser bundle.

export type Operation = "MARKETPLACE" | "VENDOR";
export type OccurrenceStatus = "closed" | "full" | "partial" | "available";

export interface PersonRef {
  id: string;
  name: string;
  status: string;
}

export interface RosterSlot {
  id: string;
  label: string;
  windowStart: string;
  windowEnd: string;
  staffPositions: number;
  active: boolean;
}

export interface OccurrenceView {
  date: string;
  closed: boolean;
  limit: number | null;
  limitSource: "closed" | "exception" | "weekly" | "default" | "none";
  staff: PersonRef[];
  staffSource: "exception" | "weekly";
  hasException: boolean;
  note: string | null;
  paid: number;
  pending: number;
  booked: number;
  remaining: number | null;
  status: OccurrenceStatus;
  overCapacity: boolean;
}

export interface RosterCellView {
  slotId: string;
  weekday: number;
  maxDeliveries: number | null;
  effectiveMax: number | null;
  deliverers: PersonRef[];
  upcoming: OccurrenceView;
}

export interface RosterWeekView {
  operation: Operation;
  timezone: string;
  today: string;
  defaultMaxDeliveries: number | null;
  slots: RosterSlot[];
  days: { weekday: number; name: string; date: string }[];
  cells: RosterCellView[];
  deliverers: PersonRef[];
}

export interface DeliveryRow {
  scheduledDeliveryId: string | null;
  bookingId: string | null;
  orderIds: string[];
  reference: string;
  buyerName: string;
  businessNames: string[];
  paid: boolean;
  dispatched: boolean;
  plannedDeliverer: PersonRef | null;
  planSource: "ROSTER" | "MANUAL" | "SUGGESTED" | null;
  assignedDeliverers: PersonRef[];
}

export interface RosterDateSlotView {
  slot: RosterSlot;
  occurrence: OccurrenceView;
  weekly: { maxDeliveries: number | null; deliverers: PersonRef[] };
  exception: { id: string; closed: boolean; maxDeliveries: number | null; replaceDeliverers: boolean; delivererIds: string[]; note: string | null } | null;
  dateRoster: PersonRef[];
  deliveries: DeliveryRow[];
}

export interface RosterDateView {
  operation: Operation;
  date: string;
  weekday: number;
  editable: boolean;
  deliverers: PersonRef[];
  slots: RosterDateSlotView[];
}

export interface RosterImpact {
  overCapacity: { slotId: string; slotLabel: string; date: string; booked: number; newLimit: number }[];
  replans: { scheduledDeliveryId: string; slotLabel: string; date: string; plannedDeliverer: string | null }[];
  unchanged: { scheduledDeliveryId: string; slotLabel: string; date: string; plannedDeliverer: string | null; reason: "manual" | "dispatched" }[];
}

export type RosterChange =
  | { kind: "cell"; slotId: string; weekday: number; delivererIds: string[]; maxDeliveries: number | null }
  | { kind: "exception"; slotId: string; date: string; closed: boolean; maxDeliveries: number | null; replaceDeliverers: boolean; delivererIds: string[]; note: string | null }
  | { kind: "clear-exception"; slotId: string; date: string }
  | { kind: "default"; defaultMaxDeliveries: number | null };

export const OPERATION_LABELS: Record<Operation, string> = {
  MARKETPLACE: "Marketplace Delivery Roster",
  VENDOR: "Vendor Market Delivery Roster",
};

export const STATUS_LABELS: Record<OccurrenceStatus, string> = {
  available: "Available",
  partial: "Partially booked",
  full: "Full",
  closed: "Closed",
};

export const STATUS_STYLES: Record<OccurrenceStatus, string> = {
  available: "bg-green-50 text-green-700 border-green-200",
  partial: "bg-blue-50 text-blue-700 border-blue-200",
  full: "bg-red-50 text-red-700 border-red-200",
  closed: "bg-gray-100 text-gray-700 border-gray-300",
};

// "17:30" -> "5:30 PM" (slot windows are school-timezone wall-clock times).
export function formatClock(hhmm: string): string {
  const [hour, minute] = hhmm.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

export function slotWindow(slot: Pick<RosterSlot, "windowStart" | "windowEnd">): string {
  return `${formatClock(slot.windowStart)} – ${formatClock(slot.windowEnd)}`;
}

// Calendar dates are UTC-midnight school dates, so they're formatted in UTC to show the same day everywhere.
export function formatDay(iso: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat("en-NG", { ...options, timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

export function limitText(limit: number | null): string {
  return limit === null ? "No limit" : `Max ${limit}`;
}
