// services/marketplace/delivery-roster/roster-slots.ts
//
// The time slots (rows of the roster calendar) of each delivery operation, behind one shape:
//   VENDOR      -> public."VendorDeliverySlot" — the timeframes vendor customers already book. Managed where it always
//                  was (Admin -> Vendor Delivery); its delivererCapacity is the slot's staff positions.
//   MARKETPLACE -> marketplace."CentralDeliverySlot" — new; managed here. With none active, central (Business)
//                  checkout keeps scheduling exactly as before (estimated date only).
// Slots are deactivated, never deleted, so a delivery booked into one always keeps a readable slot.

import type { DeliveryOperation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/service-error";
import type { Db } from "@/services/marketplace/order/shared/db";
import { logAdminAction } from "@/services/marketplace/admin/shared/log-admin-action";

export interface RosterSlot {
  id: string;
  label: string;
  windowStart: string;
  windowEnd: string;
  staffPositions: number;
  active: boolean;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function listRosterSlots(operation: DeliveryOperation, db: Db = prisma, { includeInactive = false } = {}): Promise<RosterSlot[]> {
  const where = includeInactive ? {} : { active: true };
  if (operation === "VENDOR") {
    const slots = await db.vendorDeliverySlot.findMany({ where, orderBy: { windowStart: "asc" } });
    return slots.map((s) => ({ id: s.id, label: s.label, windowStart: s.windowStart, windowEnd: s.windowEnd, staffPositions: s.delivererCapacity, active: s.active }));
  }
  const slots = await db.centralDeliverySlot.findMany({ where, orderBy: { windowStart: "asc" } });
  return slots.map((s) => ({ id: s.id, label: s.label, windowStart: s.windowStart, windowEnd: s.windowEnd, staffPositions: s.staffPositions, active: s.active }));
}

// A slot id from the browser is only trusted once it's found in THIS operation's slot table.
export async function requireRosterSlot(operation: DeliveryOperation, slotId: unknown, db: Db = prisma, { mustBeActive = true } = {}): Promise<RosterSlot> {
  if (typeof slotId !== "string" || !slotId.trim()) throw badRequest("slotId is required.");
  const slots = await listRosterSlots(operation, db, { includeInactive: true });
  const slot = slots.find((s) => s.id === slotId);
  if (!slot || (mustBeActive && !slot.active)) throw notFound("Delivery slot not found for this roster.");
  return slot;
}

export interface CentralSlotInput {
  label?: unknown;
  windowStart?: unknown;
  windowEnd?: unknown;
  staffPositions?: unknown;
  active?: unknown;
}

function validateCentralSlot(input: CentralSlotInput, existing?: RosterSlot) {
  const label = input.label === undefined ? existing?.label : typeof input.label === "string" ? input.label.trim().slice(0, 60) : "";
  if (!label) throw badRequest("label is required.");
  const windowStart = input.windowStart === undefined ? existing?.windowStart : input.windowStart;
  const windowEnd = input.windowEnd === undefined ? existing?.windowEnd : input.windowEnd;
  if (typeof windowStart !== "string" || !TIME_PATTERN.test(windowStart)) throw badRequest('windowStart must be "HH:MM".');
  if (typeof windowEnd !== "string" || !TIME_PATTERN.test(windowEnd)) throw badRequest('windowEnd must be "HH:MM".');
  if (windowStart >= windowEnd) throw badRequest("windowStart must be before windowEnd.");
  const staffPositions = input.staffPositions === undefined ? (existing?.staffPositions ?? 1) : input.staffPositions;
  if (typeof staffPositions !== "number" || !Number.isInteger(staffPositions) || staffPositions < 0 || staffPositions > 50) {
    throw badRequest("staffPositions must be a whole number from 0 to 50.");
  }
  const active = input.active === undefined ? (existing?.active ?? true) : input.active;
  if (typeof active !== "boolean") throw badRequest("active must be true or false.");
  return { label, windowStart, windowEnd, staffPositions, active };
}

export async function createCentralSlot(input: CentralSlotInput, adminUserId: string): Promise<RosterSlot> {
  const data = validateCentralSlot(input);
  const slot = await prisma.centralDeliverySlot.create({ data });
  await logAdminAction({ adminId: adminUserId, action: "CENTRAL_SLOT_CREATED", targetType: "central_delivery_slot", targetId: slot.id, message: `${slot.label} ${slot.windowStart}-${slot.windowEnd}` });
  return { ...data, id: slot.id };
}

// Changing a slot's times or deactivating it never moves a delivery already booked into it: the delivery keeps its
// slot (ScheduledDelivery.slotId) and the order keeps the window it was given. Deactivating only stops new bookings.
export async function updateCentralSlot(slotId: string, input: CentralSlotInput, adminUserId: string): Promise<RosterSlot> {
  const existing = await requireRosterSlot("MARKETPLACE", slotId, prisma, { mustBeActive: false });
  const data = validateCentralSlot(input, existing);
  await prisma.centralDeliverySlot.update({ where: { id: slotId }, data });
  await logAdminAction({
    adminId: adminUserId,
    action: "CENTRAL_SLOT_UPDATED",
    targetType: "central_delivery_slot",
    targetId: slotId,
    message: `${data.label} ${data.windowStart}-${data.windowEnd} positions=${data.staffPositions} active=${data.active}`,
  });
  return { ...data, id: slotId };
}
