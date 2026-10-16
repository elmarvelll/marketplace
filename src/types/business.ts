// src/types/business.ts
//
// Shared shapes for the marketplace's business onboarding/edit form
// (src/app/business/_components/), the
// /api/marketplace/businesses[...] routes, and the business dashboard
// (src/app/business/[id]/page.tsx).

// Fields collected on the "Create a business" onboarding form and reused by
// the dashboard's "Edit profile" form. publicId/secureUrl come from
// POST /api/marketplace/uploads (Cloudinary), not typed by hand.
// bankName/bankCode/accountNumber/accountHolderName come from the Paystack
// bank dropdown + account resolution flow (lib/external/paystack.ts).
// bankCode is persisted (needed by the seller-payout system to create a
// Paystack transfer recipient) — see
// docs/marketplace/decisions/business-bank-code-reintroduced.md.
// One of the 7 days of the week a business can select as a delivery day —
// see docs/marketplace/data/delivery-days.md. Up to 4 may be selected; 1-2
// is recommended so the business has enough lead time to prepare orders.
export type DeliveryDay = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";

export const MAX_DELIVERY_DAYS = 4;
export const RECOMMENDED_MAX_DELIVERY_DAYS = 2;

export interface BusinessFormValues {
  name: string;
  industry: string;
  description: string;
  contactInfo?: string;
  website?: string;
  instagram?: string;
  linkedin?: string;
  location?: string;
  publicId?: string;
  secureUrl?: string;
  bankName?: string;
  bankCode?: string;
  accountNumber?: string;
  accountHolderName?: string;
  deliveryDays?: DeliveryDay[];
}

export type BusinessApprovalStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type VerificationRequestStatus = "NOT_REQUESTED" | "PENDING" | "APPROVED" | "REJECTED";
// "BUSINESS" | "SCHOOL_VENDOR" — see docs/marketplace/decisions/vendor-extends-business.md.
export type BusinessType = "BUSINESS" | "SCHOOL_VENDOR";

// Minimal shape used by the navbar's "My Businesses" dropdown — just
// enough to list a business and link to its dashboard.
export interface BusinessSummary {
  id: string;
  name: string;
  industry: string;
  secureUrl: string | null;
  approvalStatus: BusinessApprovalStatus;
  type: BusinessType;
}

export interface BusinessStats {
  revenue: number;
  profit: number;
  orderCount: number;
  productCount: number;
}

export interface BusinessDetail extends BusinessSummary, Omit<BusinessFormValues, "secureUrl"> {
  type: BusinessType;
  createdAt: string;
  stats: BusinessStats;
  deliveryRestricted: boolean;
  rejectionReason: string | null;
  // Admin block (services/marketplace/admin/block-business.ts). Optional so older cached responses still type-check.
  blocked?: boolean;
  blockedReason?: string | null;
  verified: boolean;
  verificationRequestStatus: VerificationRequestStatus;
  verificationRejectionReason: string | null;
  completedOrderCount: number;
  verificationOrderThreshold: number;
}
