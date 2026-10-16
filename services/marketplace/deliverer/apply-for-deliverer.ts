// services/marketplace/deliverer/apply-for-deliverer.ts
//
// Submits ("Become a Deliverer") or resubmits a deliverer application.
// Deliverer.userId is @unique, so a REJECTED applicant reapplying can't
// just create a second row — this updates the existing one back to
// PENDING instead, which is what actually lets rejection be non-permanent
// (see docs/marketplace/decisions/rejected-deliverer-can-reapply.md).
// PENDING/APPROVED/SUSPENDED all block a resubmission outright. Called by
// src/app/api/marketplace/deliverer/apply/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { badRequest, conflict } from "@/lib/service-error";

export interface DelivererApplicationInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  hall?: string;
  room?: string;
  // VendorDeliverySlot ids the applicant prefers — a preference only, see
  // Deliverer.preferredAvailability's schema comment.
  preferredAvailability?: string[];
}

export async function applyForDeliverer(userId: string, input: DelivererApplicationInput) {
  const existing = await prisma.deliverer.findUnique({ where: { userId } });
  if (existing && existing.status !== "REJECTED") {
    throw conflict("You've already applied to become a deliverer.");
  }

  // Email verification (studentEmailVerifiedAt) and application approval
  // are separate concepts (spec §36) — this only gates the FORMER,
  // proving the applicant controls the student mailbox they entered.
  // Approval still requires an admin decision below/afterward.
  const applicant = await prisma.user.findUnique({ where: { id: userId }, select: { studentEmailVerifiedAt: true, studentEmailLocalPart: true } });
  if (!applicant?.studentEmailVerifiedAt) {
    throw badRequest("Verify your student email before submitting your application.");
  }

  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim();
  const email = input.email?.trim();
  if (!firstName || !lastName || !email) {
    throw badRequest("First name, last name, and email are required.");
  }
  const phone = input.phone?.trim() || undefined;
  const hall = input.hall?.trim() || undefined;
  const room = input.room?.trim() || undefined;
  const preferredAvailability = (input.preferredAvailability ?? []).filter(Boolean).join(",") || undefined;

  return existing
    ? prisma.deliverer.update({
        where: { userId },
        data: { firstName, lastName, email, phone, hall, room, preferredAvailability, status: "PENDING", appliedAt: new Date(), rejectedAt: null, rejectionReason: null },
        select: { id: true, status: true, appliedAt: true },
      })
    : prisma.deliverer.create({
        data: { userId, firstName, lastName, email, phone, hall, room, preferredAvailability },
        select: { id: true, status: true, appliedAt: true },
      });
}
