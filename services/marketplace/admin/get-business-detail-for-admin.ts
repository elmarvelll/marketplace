// services/marketplace/admin/get-business-detail-for-admin.ts
//
// One business's full detail for the admin Businesses/Verifications tabs
// and the new admin Business Profile page
// (src/app/admin/businesses/[businessId]/page.tsx)
// — every field the business submitted at registration/edit (see
// src/types/business.ts's BusinessFormValues), plus admin-only state
// (approval/verification/block status, counts) and the business's
// products (reusing services/marketplace/product/list-business-products.ts
// as-is — it's already businessId-scoped with no ownership check, so it's
// directly callable here). Called by
// src/app/api/marketplace/admin/businesses/[businessId]/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";
import { listBusinessProducts } from "@/services/marketplace/product/list-business-products";
import { PAID_ORDER } from "@/services/marketplace/order/shared/paid-order";

export async function getBusinessDetailForAdmin(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      industry: true,
      description: true,
      public_id: true,
      secure_url: true,
      contactInfo: true,
      website: true,
      instagram: true,
      linkedin: true,
      location: true,
      // Legacy fields — present on the model but not part of the current
      // onboarding form (see src/types/business.ts's comment); still
      // shown when a business happens to have them set.
      paymentMethod: true,
      serviceDays: true,
      serviceTimes: true,
      bankName: true,
      bankCode: true,
      accountNumber: true,
      accountHolderName: true,
      paystackRecipientCode: true,
      visitors: true,
      approvalStatus: true,
      approvedAt: true,
      approvedBy: true,
      rejectedAt: true,
      rejectionReason: true,
      verified: true,
      verifiedAt: true,
      blocked: true,
      blockedAt: true,
      blockedReason: true,
      deliveryRestricted: true,
      lateDeliveryCount: true,
      createdAt: true,
      deliveryDays: { select: { day: true } },
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      _count: { select: { products: true, orders: { where: PAID_ORDER }, reports: true } },
    },
  });
  if (!business) throw notFound("Business not found.");

  const { user, _count, deliveryDays, createdAt, approvedAt, rejectedAt, verifiedAt, blockedAt, public_id, secure_url, ...rest } =
    business;

  const products = await listBusinessProducts(businessId);

  return {
    ...rest,
    publicId: public_id,
    secureUrl: secure_url,
    deliveryDays: deliveryDays.map((row) => row.day),
    createdAt: createdAt.toISOString(),
    approvedAt: approvedAt?.toISOString() ?? null,
    rejectedAt: rejectedAt?.toISOString() ?? null,
    verifiedAt: verifiedAt?.toISOString() ?? null,
    blockedAt: blockedAt?.toISOString() ?? null,
    owner: user,
    productCount: _count.products,
    orderCount: _count.orders,
    reportCount: _count.reports,
    products,
  };
}
