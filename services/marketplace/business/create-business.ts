// services/marketplace/business/create-business.ts
//
// Creates a business from the onboarding form. Called by
// src/app/api/marketplace/businesses/route.controller.ts.

import type { DayOfWeek } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BusinessFormValues } from "@/types/business";
import { requireCoreBusinessFields, sanitizeDeliveryDays } from "./shared/business-fields";
import { sendEmail, newBusinessRegistrationEmail, getAdminEmail } from "@/services/marketplace/notifications/email.service";
import { notifyAdmins } from "@/services/marketplace/notifications/notification.service";

export async function createBusiness(userId: string, data: Partial<BusinessFormValues>) {
  const { name, industry, description } = requireCoreBusinessFields(data);
  const deliveryDays = sanitizeDeliveryDays(data.deliveryDays);

  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });

  const business = await prisma.business.create({
    data: {
      name,
      industry,
      description,
      contactInfo: data.contactInfo?.trim() || undefined,
      website: data.website?.trim() || undefined,
      instagram: data.instagram?.trim() || undefined,
      linkedin: data.linkedin?.trim() || undefined,
      location: data.location?.trim() || undefined,
      public_id: data.publicId?.trim() || undefined,
      secure_url: data.secureUrl?.trim() || undefined,
      bankName: data.bankName?.trim() || undefined,
      bankCode: data.bankCode?.trim() || undefined,
      accountNumber: data.accountNumber?.trim() || undefined,
      accountHolderName: data.accountHolderName?.trim() || undefined,
      userId,
      // Every new business starts out pending admin review — see
      // BusinessApprovalStatus's doc comment in prisma/schema.prisma.
      // Explicit here (matches the column's own @default) since it's the
      // whole point of this action, not incidental.
      approvalStatus: "PENDING_APPROVAL",
      deliveryDays: deliveryDays.length > 0 ? { create: deliveryDays.map((day) => ({ day: day as DayOfWeek })) } : undefined,
    },
    select: { id: true, name: true, industry: true, secure_url: true, approvalStatus: true },
  });

  const adminEmail = getAdminEmail();
  if (adminEmail) {
    void sendEmail({
      to: adminEmail,
      ...newBusinessRegistrationEmail({ businessName: name, ownerEmail: owner?.email ?? "unknown", industry, businessId: business.id }),
    });
  }
  await notifyAdmins({
    type: "NEW_BUSINESS_REGISTRATION",
    title: "New business registration",
    message: `${name} is awaiting approval.`,
    targetUrl: "/admin/businesses",
    businessId: business.id,
  });

  const { secure_url, ...rest } = business;
  return { ...rest, secureUrl: secure_url };
}
