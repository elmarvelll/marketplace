// services/marketplace/business/business-ownership.service.ts
//
// Shared "does this business belong to this signed-in user" check, used by
// every owner-scoped controller (business profile, products, orders,
// fines) so a business's dashboard data is only ever readable/writable by
// its owner. Throws ServiceError (401/404) rather than returning a
// NextResponse — see src/lib/service-error.ts and
// src/lib/controller-helpers.ts for how controllers turn that into the
// right HTTP response.

import type { Session } from "next-auth";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { unauthorized, notFound } from "@/lib/service-error";

export interface OwnedBusiness {
  session: Session;
  businessId: string;
}

export async function requireOwnedBusiness(businessId: string): Promise<OwnedBusiness> {
  const session = await getActiveSession();
  if (!session?.user?.id) {
    throw unauthorized();
  }

  const business = await prisma.business.findFirst({
    where: { id: businessId, userId: session.user.id },
    select: { id: true },
  });
  if (!business) {
    throw notFound("Business not found.");
  }

  return { session, businessId: business.id };
}

// Business-only variant — rejects a School Vendor row even if the caller
// owns it, so Business's own product/order API routes can't become a
// second, un-gated path into vendor resources just because the generic
// ownership check alone would pass (a determined vendor owner typing the
// Business API URL directly, not just following a UI link) — see
// docs/marketplace/decisions/vendor-independent-architecture.md. Not
// used by requireOwnedBusiness itself, since Vendor's own service layer
// legitimately calls that one too.
export async function requireOwnedBusinessOnly(businessId: string): Promise<OwnedBusiness> {
  const owned = await requireOwnedBusiness(businessId);
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { type: true } });
  if (!business || business.type !== "BUSINESS") {
    throw notFound("Business not found.");
  }
  return owned;
}
