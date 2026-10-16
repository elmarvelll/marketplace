// services/marketplace/admin/vendor-delivery/manage-vendor-slots.ts
//
// Admin CRUD for VendorDeliverySlot — capacity, cutoff, prep-deadline are
// all here, never a hardcoded MAX_DELIVERERS/3-slot array in application
// code (spec §40). Called by
// src/app/api/marketplace/admin/vendor-delivery/slots/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/service-error";
import { logAdminAction } from "@/services/marketplace/admin/shared/log-admin-action";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function listVendorSlots() {
  return prisma.vendorDeliverySlot.findMany({ orderBy: { windowStart: "asc" } });
}

export interface VendorSlotInput {
  label: string;
  windowStart: string;
  windowEnd: string;
  bookingCutoffMins?: number;
  vendorPrepDeadlineMins?: number;
  delivererCapacity?: number;
  active?: boolean;
}

function validate(input: Partial<VendorSlotInput>) {
  if (input.windowStart !== undefined && !TIME_PATTERN.test(input.windowStart)) throw badRequest("windowStart must be \"HH:MM\".");
  if (input.windowEnd !== undefined && !TIME_PATTERN.test(input.windowEnd)) throw badRequest("windowEnd must be \"HH:MM\".");
  if (input.windowStart && input.windowEnd && input.windowStart >= input.windowEnd) throw badRequest("windowStart must be before windowEnd.");
  if (input.bookingCutoffMins !== undefined && (!Number.isFinite(input.bookingCutoffMins) || input.bookingCutoffMins < 0)) {
    throw badRequest("bookingCutoffMins must be a non-negative number.");
  }
  if (input.vendorPrepDeadlineMins !== undefined && (!Number.isFinite(input.vendorPrepDeadlineMins) || input.vendorPrepDeadlineMins < 0)) {
    throw badRequest("vendorPrepDeadlineMins must be a non-negative number.");
  }
  if (input.delivererCapacity !== undefined && (!Number.isInteger(input.delivererCapacity) || input.delivererCapacity < 0)) {
    throw badRequest("delivererCapacity must be a non-negative integer.");
  }
}

export async function createVendorSlot(input: VendorSlotInput, adminUserId: string) {
  if (!input.label?.trim()) throw badRequest("label is required.");
  validate(input);
  const slot = await prisma.vendorDeliverySlot.create({
    data: {
      label: input.label.trim(),
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      bookingCutoffMins: input.bookingCutoffMins ?? 90,
      vendorPrepDeadlineMins: input.vendorPrepDeadlineMins ?? 30,
      delivererCapacity: input.delivererCapacity ?? 1,
      active: input.active ?? true,
    },
  });
  await logAdminAction({ adminId: adminUserId, action: "VENDOR_SLOT_CREATED", targetType: "vendor_delivery_slot", targetId: slot.id, message: slot.label });
  return slot;
}

export async function updateVendorSlot(slotId: string, input: Partial<VendorSlotInput>, adminUserId: string) {
  const existing = await prisma.vendorDeliverySlot.findUnique({ where: { id: slotId } });
  if (!existing) throw notFound("Delivery slot not found.");
  validate(input);

  const slot = await prisma.vendorDeliverySlot.update({
    where: { id: slotId },
    data: {
      label: input.label?.trim() ?? existing.label,
      windowStart: input.windowStart ?? existing.windowStart,
      windowEnd: input.windowEnd ?? existing.windowEnd,
      bookingCutoffMins: input.bookingCutoffMins ?? existing.bookingCutoffMins,
      vendorPrepDeadlineMins: input.vendorPrepDeadlineMins ?? existing.vendorPrepDeadlineMins,
      delivererCapacity: input.delivererCapacity ?? existing.delivererCapacity,
      active: input.active ?? existing.active,
    },
  });
  await logAdminAction({
    adminId: adminUserId,
    action: "VENDOR_SLOT_UPDATED",
    targetType: "vendor_delivery_slot",
    targetId: slot.id,
    message: `capacity=${slot.delivererCapacity} active=${slot.active}`,
  });
  return slot;
}
