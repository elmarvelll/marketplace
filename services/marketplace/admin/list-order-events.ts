// services/marketplace/admin/list-order-events.ts
//
// Cross-order OrderEvent feed for the admin Events tab — every event,
// across every order, most recent first, joined through order -> business
// and order -> buyer so business name and seller (business owner) name
// are returned directly rather than making the admin cross-reference IDs.
// Called by src/app/api/marketplace/admin/events/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { parsePageParams, toPageResult, type PageResult } from "./shared/pagination";

export interface AdminEventRow {
  id: string;
  orderId: string;
  orderItemId: string | null;
  type: string;
  actorType: string;
  actorId: string | null;
  message: string | null;
  createdAt: string;
  businessName: string;
  sellerName: string;
  buyerEmail: string;
}

export async function listOrderEvents(searchParams: URLSearchParams): Promise<PageResult<AdminEventRow>> {
  const pageParams = parsePageParams(searchParams);
  const orderId = searchParams.get("orderId")?.trim();

  const where = orderId ? { orderId } : {};

  const [events, total] = await Promise.all([
    prisma.orderEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageParams.page - 1) * pageParams.pageSize,
      take: pageParams.pageSize,
      select: {
        id: true,
        orderId: true,
        orderItemId: true,
        type: true,
        actorType: true,
        actorId: true,
        message: true,
        createdAt: true,
        order: { select: { business: { select: { name: true, user: { select: { firstName: true, lastName: true } } } }, user: { select: { email: true } } } },
      },
    }),
    prisma.orderEvent.count({ where }),
  ]);

  return toPageResult(
    events.map((e) => ({
      id: e.id,
      orderId: e.orderId,
      orderItemId: e.orderItemId,
      type: e.type,
      actorType: e.actorType,
      actorId: e.actorId,
      message: e.message,
      createdAt: e.createdAt.toISOString(),
      businessName: e.order.business.name,
      sellerName: `${e.order.business.user.firstName} ${e.order.business.user.lastName}`,
      buyerEmail: e.order.user.email,
    })),
    total,
    pageParams
  );
}
