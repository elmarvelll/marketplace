// src/types/vendor.ts
//
// Shared shapes for the School Vendor application form (footer "Become a
// Vendor"), the /api/marketplace/vendor[...] routes, and the vendor
// dashboard. A vendor is a Business row with type = SCHOOL_VENDOR (see
// docs/marketplace/decisions/vendor-extends-business.md) — this type
// mirrors BusinessFormValues in src/types/business.ts, adding only the
// vendor-specific fields the spec requires, since the underlying create
// action still writes a Business row.

export const VENDOR_CATEGORIES = ["Food", "Drinks", "Snacks", "Other"] as const;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

export interface VendorApplicationFormValues {
  // Applicant's own name is already on their User account (session) — the
  // spec's "applicant name" field is collected for display/contact
  // purposes on the application, not a second identity.
  applicantName: string;
  name: string; // business/vendor name
  location: string;
  vendorCategory: VendorCategory;
  // Bank account fields go through the existing Paystack resolve-account
  // flow (see services/marketplace/payment/resolve-account.ts) before
  // submission — accountHolderName here must be the resolved value, never
  // client-typed, enforced server-side in create-vendor-application.ts.
  bankName?: string;
  bankCode?: string;
  accountNumber?: string;
  accountHolderName?: string;
  // "HH:MM" operating window, spec default 5PM-8PM.
  availabilityStart?: string;
  availabilityEnd?: string;
}
