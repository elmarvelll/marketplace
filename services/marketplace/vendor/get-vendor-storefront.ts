// services/marketplace/vendor/get-vendor-storefront.ts
//
// Public (not owner-scoped) vendor storefront — profile, products (with
// variants), and available universal Sides. Called by
// src/app/api/marketplace/vendor/[id]/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";
import { productVariantSelect, toVariantSummary } from "@/services/marketplace/product/shared/product-variants";

export async function getVendorStorefront(businessId: string) {
  const vendor = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      description: true,
      vendorCategory: true,
      location: true,
      availabilityStart: true,
      availabilityEnd: true,
      secure_url: true,
      approvalStatus: true,
      blocked: true,
      type: true,
      paused: true,
      pausedReason: true,
      products: {
        select: { id: true, name: true, category: true, price: true, stock: true, secure_url: true, variants: { select: productVariantSelect } },
        orderBy: { createdAt: "desc" },
      },
      sides: { where: { available: true }, orderBy: { createdAt: "desc" } },
    },
  });

  // Not found (not just forbidden) — same convention as
  // get-public-product-detail.ts: a pending/rejected/non-vendor business
  // is indistinguishable from not existing to a public visitor.
  if (!vendor || vendor.type !== "SCHOOL_VENDOR" || vendor.approvalStatus !== "APPROVED" || vendor.blocked) {
    throw notFound("Vendor not found.");
  }

  const { secure_url, products, ...rest } = vendor;
  return {
    ...rest,
    secureUrl: secure_url,
    products: products.map(({ secure_url: productUrl, variants, ...product }) => ({
      ...product,
      secureUrl: productUrl,
      variants: variants.map(toVariantSummary),
    })),
  };
}
