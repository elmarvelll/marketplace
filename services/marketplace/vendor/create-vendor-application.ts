// services/marketplace/vendor/create-vendor-application.ts
//
// Creates a School Vendor application — a Business row with
// type = SCHOOL_VENDOR (see docs/marketplace/decisions/vendor-extends-business.md).
// Mirrors services/marketplace/business/create-business.ts closely: same
// PENDING_APPROVAL start state, same admin-notification pattern. The one
// deliberate difference is bank verification — the account holder name is
// never trusted from the client; it's re-resolved here via the existing
// Paystack resolve flow, and that resolved value (not whatever the client
// sent) is what's persisted. Called by
// src/app/api/marketplace/vendor/apply/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/service-error";
import { resolveAccount } from "@/services/marketplace/payment/resolve-account";
import { sendEmail, newBusinessRegistrationEmail, getAdminEmail } from "@/services/marketplace/notifications/email.service";
import { notifyAdmins } from "@/services/marketplace/notifications/notification.service";
import { VENDOR_CATEGORIES, type VendorApplicationFormValues } from "@/types/vendor";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function sanitizeAvailability(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && TIME_RE.test(trimmed) ? trimmed : fallback;
}

export async function createVendorApplication(userId: string, data: Partial<VendorApplicationFormValues>) {
  const applicantName = data.applicantName?.trim();
  const name = data.name?.trim();
  const location = data.location?.trim();
  const vendorCategory = data.vendorCategory;
  if (!applicantName || !name || !location) {
    throw badRequest("Applicant name, vendor name, and location are required.");
  }
  if (!vendorCategory || !VENDOR_CATEGORIES.includes(vendorCategory)) {
    throw badRequest(`Category must be one of: ${VENDOR_CATEGORIES.join(", ")}.`);
  }

  // Bank details are optional at application time (same convention as
  // Business — see create-business.ts's own comment), but if any bank
  // field is supplied, all three are required and the account holder name
  // is authoritatively resolved via Paystack, never taken from the client.
  let accountHolderName: string | undefined;
  const bankName = data.bankName?.trim() || undefined;
  const bankCode = data.bankCode?.trim() || undefined;
  const accountNumber = data.accountNumber?.trim() || undefined;
  if (bankName || bankCode || accountNumber) {
    if (!bankName || !bankCode || !accountNumber) {
      throw badRequest("bankName, bankCode, and accountNumber must all be provided together.");
    }
    const resolved = await resolveAccount(accountNumber, bankCode);
    accountHolderName = resolved.accountName;
  }

  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });

  const availabilityStart = sanitizeAvailability(data.availabilityStart, "17:00");
  const availabilityEnd = sanitizeAvailability(data.availabilityEnd, "20:00");

  const business = await prisma.business.create({
    data: {
      name,
      // Business.industry is required and free-text; vendorCategory is
      // the vendor-specific structured value, industry just mirrors it so
      // every existing "industry" display/filter still shows something
      // sensible for a vendor row.
      industry: vendorCategory,
      vendorCategory,
      description: `${applicantName}'s School Vendor application.`,
      contactInfo: applicantName,
      location,
      bankName,
      bankCode,
      accountNumber,
      accountHolderName,
      availabilityStart,
      availabilityEnd,
      type: "SCHOOL_VENDOR",
      userId,
      approvalStatus: "PENDING_APPROVAL",
    },
    select: { id: true, name: true, vendorCategory: true, approvalStatus: true },
  });

  const adminEmail = getAdminEmail();
  if (adminEmail) {
    void sendEmail({
      to: adminEmail,
      ...newBusinessRegistrationEmail({ businessName: name, ownerEmail: owner?.email ?? "unknown", industry: vendorCategory, businessId: business.id }),
    });
  }
  await notifyAdmins({
    type: "NEW_VENDOR_APPLICATION",
    title: "New School Vendor application",
    message: `${name} (${vendorCategory}) is awaiting approval.`,
    targetUrl: "/admin/businesses?type=SCHOOL_VENDOR",
    businessId: business.id,
  });

  return business;
}
