// services/marketplace/vendor-delivery/handover/shift.ts
//
// A deliverer's SHIFT = one Vendor slot occurrence (slot + date) in which
// they hold assigned deliveries. Before working it they report to the
// meeting point; an admin (vendor manager) checks them in, which starts the
// shift and hands over their card. States, as both sides see them:
//
//   SCHEDULED    not checked in yet, slot not over
//   IN_PROGRESS  checked in; deliveries under way
//   DELIVERED    checked in; every delivery done (or cancelled)
//   MISSED       the slot ended without a check-in. An admin may still
//                unlock it afterwards (late check-in, with a note) so the
//                deliveries can be finished — it stays counted as missed.
//
// The check-in is enforced, not just displayed: requireShiftCheckIn gates
// the deliverer's vendor pickups, starting a delivery, reporting a failed
// attempt and confirming with the student's code.
//
// Meeting point: ONE location per operation for now (all deliverers are
// male). When female deliverers join, this needs separate meeting points
// (e.g. per deliverer group) — DeliveryRosterSettings.checkInLocation is the
// single place to change.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict } from "@/lib/service-error";
import { logAdminAction } from "@/services/marketplace/admin/shared/log-admin-action";
import { slotEndsAt } from "./delivery-deadline";

export type ShiftState = "SCHEDULED" | "IN_PROGRESS" | "DELIVERED" | "MISSED";

export interface ShiftCheckInRow {
  checkedInAt: Date;
  late: boolean;
}

// done = every live delivery of the shift is finished (delivered, or failed/cancelled and out of the deliverer's hands).
export function shiftState(checkIn: ShiftCheckInRow | null, slotEnd: Date, done: boolean, now: Date = new Date()): { state: ShiftState; unlocked: boolean } {
  if (!checkIn) return { state: now > slotEnd ? "MISSED" : "SCHEDULED", unlocked: false };
  if (checkIn.late) return { state: "MISSED", unlocked: true };
  return { state: done ? "DELIVERED" : "IN_PROGRESS", unlocked: true };
}

export async function getCheckInLocation(operation: "VENDOR" | "MARKETPLACE" = "VENDOR"): Promise<string | null> {
  const row = await prisma.deliveryRosterSettings.findUnique({ where: { operation }, select: { checkInLocation: true } });
  return row?.checkInLocation ?? null;
}

export async function setCheckInLocation(adminUserId: string, location: unknown, operation: "VENDOR" | "MARKETPLACE" = "VENDOR") {
  if (typeof location !== "string") throw badRequest("location must be text.");
  const clean = location.trim().slice(0, 200) || null;
  await prisma.deliveryRosterSettings.upsert({
    where: { operation },
    update: { checkInLocation: clean, updatedBy: adminUserId },
    create: { operation, checkInLocation: clean, updatedBy: adminUserId },
  });
  await logAdminAction({ adminId: adminUserId, action: "DELIVERY_CHECK_IN_LOCATION_SET", targetType: "DeliveryRosterSettings", targetId: operation, message: clean ?? "(cleared)" });
  return { location: clean };
}

// Refuses a deliverer's vendor action for a slot occurrence they haven't been checked in for.
export async function requireShiftCheckIn(delivererId: string, slotId: string, date: Date) {
  const row = await prisma.deliveryShiftCheckIn.findUnique({
    where: { operation_slotId_date_delivererId: { operation: "VENDOR", slotId, date, delivererId } },
    select: { id: true },
  });
  if (row) return;
  const location = await getCheckInLocation();
  throw conflict(`Your shift hasn't started. Report to ${location ?? "the meeting point"} so an admin can check you in.`);
}

// Admin: the deliverer reported at the meeting point — start their shift. After the slot has ended this is a late
// unlock of a missed shift and needs a note. Idempotent.
export async function checkInShift(adminUserId: string, input: { date?: unknown; slotId?: unknown; delivererId?: unknown; note?: unknown }, now: Date = new Date()) {
  const { date: dateStr, slotId, delivererId } = input;
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || typeof slotId !== "string" || typeof delivererId !== "string") {
    throw badRequest("date (YYYY-MM-DD), slotId and delivererId are required.");
  }
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const slot = await prisma.vendorDeliverySlot.findUnique({ where: { id: slotId }, select: { windowEnd: true } });
  if (!slot) throw badRequest("Delivery slot not found.");
  const holds = await prisma.deliveryItem.count({
    where: { delivery: { deliverymanId: delivererId }, orderItem: { order: { vendorDeliveryBooking: { slotId, bookedFor: date, status: "CONFIRMED" } } } },
  });
  if (holds === 0) throw conflict("That deliverer has no deliveries in this slot.");

  const late = now > slotEndsAt(date, slot.windowEnd);
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";
  if (late && !note) throw badRequest("This slot is over, so the shift was missed. Give a reason to let them finish anyway.");

  try {
    await prisma.deliveryShiftCheckIn.create({ data: { operation: "VENDOR", slotId, date, delivererId, checkedInBy: adminUserId, late, note: note || null } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { alreadyCheckedIn: true, late };
    throw err;
  }
  await logAdminAction({
    adminId: adminUserId,
    action: late ? "DELIVERY_SHIFT_UNLOCKED_LATE" : "DELIVERY_SHIFT_CHECKED_IN",
    targetType: "Deliverer",
    targetId: delivererId,
    message: `${dateStr} slot ${slotId}${note ? `: ${note}` : ""}`,
  });
  return { alreadyCheckedIn: false, late };
}
