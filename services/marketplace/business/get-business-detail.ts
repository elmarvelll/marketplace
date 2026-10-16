// services/marketplace/business/get-business-detail.ts
//
// One business's profile + stats, for the business dashboard. Called by
// src/app/api/marketplace/businesses/[id]/route.controller.ts. Also the
// source of truth the dashboard layout gates on
// (business/_components/BusinessApprovalGate.tsx) — approvalStatus,
// rejectionReason, and the verification-request state below.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";
import { PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";

const VERIFICATION_ORDER_THRESHOLD = 20;

async function loadOwnedBusinessWithStats(id: string, userId: string) {
  return prisma.business.findFirst({
    // type: "BUSINESS" — a School Vendor row must never be reachable
    // through the Business dashboard/API, even by a determined owner
    // typing the URL directly (not just hidden from the navbar link) —
    // see docs/marketplace/decisions/vendor-independent-architecture.md.
    // Not-found (not forbidden) matches this file's own existing
    // buyer-visibility convention elsewhere in the codebase.
    where: { id, userId, type: "BUSINESS" },
    include: {
      products: { select: { id: true } },
      deliveryDays: { select: { day: true } },
      orders: {
        // Revenue/profit/order counts are over PAID orders only — unpaid
        // checkout attempts were previously counted as revenue.
        where: PAID_ORDER,
        select: {
          totalAmount: true,
          deliveryOutcome: true,
          items: { select: { quantity: true, price: true, product: { select: { cost: true } } } },
        },
      },
      verificationRequests: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, rejectionReason: true } },
    },
  });
}

export async function getBusinessDetail(businessId: string, userId: string) {
  const business = await loadOwnedBusinessWithStats(businessId, userId);
  if (!business) throw notFound("Business not found.");

  // Revenue/profit are derived from real Order/OrderItem rows.
  const revenue = business.orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const profit = business.orders.reduce(
    (sum, order) =>
      sum +
      order.items.reduce(
        // Side lines (School Vendor) have no tracked cost, same default
        // convention as Product.cost defaulting to 0 when unset.
        (lineSum, item) => lineSum + (item.price - (item.product?.cost ?? 0)) * item.quantity,
        0
      ),
    0
  );
  // "Completed order" = every item on the order buyer-confirmed delivered
  // — see services/marketplace/order/recompute-order-delivery-outcome.ts.
  // This is the eligibility count for the "Get Verified" button below.
  const completedOrderCount = business.orders.filter((order) => order.deliveryOutcome === "DELIVERED").length;

  const latestRequest = business.verificationRequests[0] ?? null;
  const verificationRequestStatus = latestRequest?.status ?? "NOT_REQUESTED";

  return {
    id: business.id,
    name: business.name,
    // "BUSINESS" | "SCHOOL_VENDOR" — see
    // docs/marketplace/decisions/vendor-extends-business.md. Lets any
    // dashboard page (Products tab, etc) branch on vendor-ness without a
    // separate fetch.
    type: business.type,
    industry: business.industry,
    description: business.description,
    contactInfo: business.contactInfo,
    website: business.website,
    instagram: business.instagram,
    linkedin: business.linkedin,
    location: business.location,
    publicId: business.public_id,
    secureUrl: business.secure_url,
    bankName: business.bankName,
    bankCode: business.bankCode,
    accountNumber: business.accountNumber,
    accountHolderName: business.accountHolderName,
    deliveryDays: business.deliveryDays.map((row) => row.day),
    deliveryRestricted: business.deliveryRestricted,
    createdAt: business.createdAt.toISOString(),
    approvalStatus: business.approvalStatus,
    rejectionReason: business.rejectionReason,
    // Admin block — shown to the owner as a banner; the reason is the one the
    // admin entered for the owner (also emailed), never internal notes.
    blocked: business.blocked,
    blockedReason: business.blocked ? business.blockedReason : null,
    verified: business.verified,
    verificationRequestStatus,
    verificationRejectionReason: latestRequest?.status === "REJECTED" ? latestRequest.rejectionReason : null,
    completedOrderCount,
    verificationOrderThreshold: VERIFICATION_ORDER_THRESHOLD,
    stats: {
      revenue,
      profit,
      orderCount: business.orders.length,
      productCount: business.products.length,
    },
  };
}
