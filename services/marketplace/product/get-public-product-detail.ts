// services/marketplace/product/get-public-product-detail.ts
//
// Public (not owner-scoped) product detail, for the product detail modal —
// includes the estimated delivery date/window so a buyer can see it before
// adding to cart. Called by
// src/app/api/marketplace/products/[id]/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";
import { getEstimatedDeliveryForBusiness, formatEstimatedDelivery } from "@/services/marketplace/delivery/estimated-delivery.service";
import { productVariantSelect, toVariantSummary } from "@/services/marketplace/product/shared/product-variants";
import { productImageSelect, toImageRows } from "@/services/marketplace/product/shared/product-images";

export async function getPublicProductDetail(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      category: true,
      description: true,
      price: true,
      stock: true,
      secure_url: true,
      businessId: true,
      business: {
        select: {
          name: true,
          approvalStatus: true,
          blocked: true,
          type: true,
          sides: { where: { available: true }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, price: true, available: true, stock: true } },
        },
      },
      images: { select: productImageSelect },
      variants: { select: productVariantSelect },
    },
  });
  // Not found (not just forbidden) — a pending/rejected business's
  // products should be indistinguishable from not existing at all to a
  // buyer browsing by URL, same as any other buyer-visibility gate in
  // this app.
  // An admin-blocked business is treated the same way.
  if (!product || product.business.approvalStatus !== "APPROVED" || product.business.blocked) throw notFound("Product not found.");

  const { secure_url, business, images, variants, ...rest } = product;

  // Business's "estimated delivery" (delivery-day based, multi-day lead
  // time) has no meaning for a School Vendor — vendors deliver same-day
  // through one of the fixed VendorDeliverySlot windows, picked at
  // checkout (see docs/marketplace/decisions/vendor-extends-business.md).
  // Skip that calculation entirely for a vendor product rather than
  // calling a Business-only function against data (BusinessDeliveryDay)
  // a vendor never has.
  const isVendor = business.type === "SCHOOL_VENDOR";
  const { date, window } = isVendor
    ? { date: "", window: "Choose a delivery slot at checkout" }
    : formatEstimatedDelivery(await getEstimatedDeliveryForBusiness(product.businessId));

  return {
    ...rest,
    secureUrl: secure_url,
    sellerName: business.name,
    businessType: business.type,
    // Universal Sides available alongside this product — only meaningful
    // for a vendor product; empty for a Business product.
    sides: isVendor ? business.sides : [],
    images: toImageRows(images).map((image) => ({ secureUrl: image.secureUrl, position: image.position })),
    variants: variants.map(toVariantSummary),
    estimatedDeliveryDate: date,
    deliveryWindow: window,
  };
}
