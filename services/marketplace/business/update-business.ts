// services/marketplace/business/update-business.ts
//
// Edits a business's profile fields, including delivery days. Called by
// src/app/api/marketplace/businesses/[id]/route.controller.ts.

import type { DayOfWeek } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/service-error";
import type { BusinessFormValues, DeliveryDay } from "@/types/business";
import { requireCoreBusinessFields, sanitizeDeliveryDays } from "./shared/business-fields";

export async function updateBusiness(businessId: string, userId: string, data: Partial<BusinessFormValues>) {
  const existing = await prisma.business.findFirst({ where: { id: businessId, userId } });
  if (!existing) throw notFound("Business not found.");

  const { name, industry, description } = requireCoreBusinessFields(data);
  const deliveryDaysProvided = data.deliveryDays !== undefined;
  const deliveryDays = sanitizeDeliveryDays(data.deliveryDays);

  const business = await prisma.$transaction(async (tx) => {
    const updated = await tx.business.update({
      where: { id: businessId },
      data: {
        name,
        industry,
        description,
        contactInfo: data.contactInfo?.trim() || null,
        website: data.website?.trim() || null,
        instagram: data.instagram?.trim() || null,
        linkedin: data.linkedin?.trim() || null,
        location: data.location?.trim() || null,
        public_id: data.publicId?.trim() || null,
        secure_url: data.secureUrl?.trim() || null,
        bankName: data.bankName?.trim() || null,
        bankCode: data.bankCode?.trim() || null,
        accountNumber: data.accountNumber?.trim() || null,
        accountHolderName: data.accountHolderName?.trim() || null,
      },
      select: {
        id: true,
        name: true,
        industry: true,
        description: true,
        contactInfo: true,
        website: true,
        instagram: true,
        linkedin: true,
        location: true,
        public_id: true,
        secure_url: true,
        bankName: true,
        bankCode: true,
        accountNumber: true,
        accountHolderName: true,
      },
    });

    // Only touch delivery days when the field is actually present in the
    // request body — this route is used for the general profile-edit form
    // too, which shouldn't silently wipe delivery days it never intended
    // to change.
    if (deliveryDaysProvided) {
      await tx.businessDeliveryDay.deleteMany({ where: { businessId } });
      if (deliveryDays.length > 0) {
        await tx.businessDeliveryDay.createMany({ data: deliveryDays.map((day: DeliveryDay) => ({ businessId, day: day as DayOfWeek })) });
      }
    }

    return updated;
  });

  const { public_id, secure_url, ...rest } = business;
  return { ...rest, publicId: public_id, secureUrl: secure_url, deliveryDays };
}
