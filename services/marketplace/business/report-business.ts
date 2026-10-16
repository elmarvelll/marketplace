// services/marketplace/business/report-business.ts
//
// The buyer-facing "Report business" action (on the product detail modal —
// no dedicated public business-profile page exists yet). Creates a
// BusinessReport row the admin Reports tab reads from
// (services/marketplace/admin/list-reports.ts). Called by
// src/app/api/marketplace/businesses/[id]/report/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { notFound, badRequest } from "@/lib/service-error";

export async function reportBusiness(businessId: string, reporterId: string, reason: string) {
  if (!reason.trim()) throw badRequest("A reason is required.");

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } });
  if (!business) throw notFound("Business not found.");

  await prisma.businessReport.create({ data: { businessId, reporterId, reason: reason.trim() } });
}
