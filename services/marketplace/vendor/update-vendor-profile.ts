// services/marketplace/vendor/update-vendor-profile.ts
//
// Owner-scoped vendor profile edit — vendor-owned fields only (name,
// category, location, availability window, bank details). Deliberately
// separate from Business's update-business.ts, which handles
// Business-only fields (industry, deliveryDays, contactInfo, website)
// this profile doesn't use — see
// docs/marketplace/decisions/vendor-independent-architecture.md. Reuses
// the same Paystack account-resolution flow Business's onboarding uses
// (services/marketplace/payment/resolve-account.ts) — the account holder
// name is never trusted from the client, same rule as vendor application.
// Called by src/app/api/marketplace/vendor/[id]/profile/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/service-error";
import { resolveAccount } from "@/services/marketplace/payment/resolve-account";

export interface VendorProfileUpdateInput {
  name?: string;
  vendorCategory?: string;
  description?: string;
  location?: string;
  availabilityStart?: string;
  availabilityEnd?: string;
  publicId?: string;
  secureUrl?: string;
  bankName?: string;
  bankCode?: string;
  accountNumber?: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function updateVendorProfile(businessId: string, userId: string, data: VendorProfileUpdateInput) {
  const existing = await prisma.business.findFirst({ where: { id: businessId, userId, type: "SCHOOL_VENDOR" } });
  if (!existing) throw notFound("Vendor not found.");

  if (data.availabilityStart !== undefined && data.availabilityStart !== null && !TIME_RE.test(data.availabilityStart)) {
    throw badRequest('availabilityStart must be "HH:MM".');
  }
  if (data.availabilityEnd !== undefined && data.availabilityEnd !== null && !TIME_RE.test(data.availabilityEnd)) {
    throw badRequest('availabilityEnd must be "HH:MM".');
  }

  // Bank details are optional, but if any of the three inputs is
  // supplied, all three must be, and the account holder name is
  // authoritatively re-resolved — never taken from the client, same rule
  // as create-vendor-application.ts.
  let accountHolderName: string | undefined;
  const bankName = data.bankName?.trim();
  const bankCode = data.bankCode?.trim();
  const accountNumber = data.accountNumber?.trim();
  if (bankName || bankCode || accountNumber) {
    if (!bankName || !bankCode || !accountNumber) {
      throw badRequest("bankName, bankCode, and accountNumber must all be provided together.");
    }
    const resolved = await resolveAccount(accountNumber, bankCode);
    accountHolderName = resolved.accountName;
  }

  const business = await prisma.business.update({
    where: { id: businessId },
    data: {
      name: data.name?.trim() || undefined,
      vendorCategory: data.vendorCategory?.trim() || undefined,
      description: data.description?.trim() || undefined,
      location: data.location?.trim() || undefined,
      availabilityStart: data.availabilityStart ?? undefined,
      availabilityEnd: data.availabilityEnd ?? undefined,
      public_id: data.publicId?.trim() || undefined,
      secure_url: data.secureUrl?.trim() || undefined,
      bankName,
      bankCode,
      accountNumber,
      accountHolderName,
    },
  });

  return {
    id: business.id,
    name: business.name,
    vendorCategory: business.vendorCategory,
    description: business.description,
    location: business.location,
    availabilityStart: business.availabilityStart,
    availabilityEnd: business.availabilityEnd,
    publicId: business.public_id,
    secureUrl: business.secure_url,
    bankName: business.bankName,
    bankCode: business.bankCode,
    accountNumber: business.accountNumber,
    accountHolderName: business.accountHolderName,
  };
}
