// services/marketplace/vendor-delivery/handover/shift.ts
//
// Deliverer ATTENDANCE for one Vendor slot occurrence (slot + date) in which
// they hold deliveries: an admin (vendor manager) may record that they
// reported at the meeting point. It is a record only — it never gates
// anything. A deliverer processes and delivers their assigned orders without
// an admin being present or online; completing a delivery needs only the
// student's code (submit-delivery-code.ts).
//
//   attendance  CHECKED_IN      recorded before the slot ended
//               CHECKED_IN_LATE recorded after the slot had ended
//               NOT_RECORDED    no check-in (says nothing about the deliveries)
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

export type Attendance = "CHECKED_IN" | "CHECKED_IN_LATE" | "NOT_RECORDED";

export function attendanceOf(checkIn: { late: boolean } | null): Attendance {
  if (!checkIn) return "NOT_RECORDED";
  return checkIn.late ? "CHECKED_IN_LATE" : "CHECKED_IN";
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

// Admin: the deliverer reported at the meeting point — record it. After the slot has ended it is recorded as late.
// Idempotent. Optional note, audited.
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

  try {
    await prisma.deliveryShiftCheckIn.create({ data: { operation: "VENDOR", slotId, date, delivererId, checkedInBy: adminUserId, late, note: note || null } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { alreadyCheckedIn: true, late };
    throw err;
  }
  await logAdminAction({
    adminId: adminUserId,
    action: late ? "DELIVERY_SHIFT_CHECKED_IN_LATE" : "DELIVERY_SHIFT_CHECKED_IN",
    targetType: "Deliverer",
    targetId: delivererId,
    message: `${dateStr} slot ${slotId}${note ? `: ${note}` : ""}`,
  });
  return { alreadyCheckedIn: false, late };
}
