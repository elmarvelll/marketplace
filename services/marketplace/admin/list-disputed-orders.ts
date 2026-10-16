// services/marketplace/admin/list-disputed-orders.ts
//
// Every disputed order, with enough context (buyer, business, items,
// amount, current state, and the full OrderEvent history) for an admin to
// understand the situation without a second lookup. Historical, not just
// current-state — the event list shows everything the order went through,
// not only where it is now. Called by
// src/app/api/marketplace/admin/disputes/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { parsePageParams, toPageResult, type PageResult } from "./shared/pagination";

export interface AdminDisputeRow {
  id: string;
  status: string;
  fulfillmentStatus: string | null;
  deliveryOutcome: string;
  paymentStatus: string;
  totalAmount: number;
  businessName: string;
  buyerEmail: string;
  disputeReason: string | null;
  disputeCreatedAt: string | null;
  disputeResolvedAt: string | null;
  disputeResolution: string | null;
  items: { id: string; productName: string; quantity: number; price: number; deliveryStatus: string | null }[];
  events: { id: string; type: string; actorType: string; message: string | null; createdAt: string }[];
}

export async function listDisputedOrders(searchParams: URLSearchParams): Promise<PageResult<AdminDisputeRow>> {
  const pageParams = parsePageParams(searchParams);
  const resolvedFilter = searchParams.get("resolved"); // "true" | "false" | null (= all)

  const where = {
    isDisputed: true,
    ...(resolvedFilter === "false" ? { disputeResolvedAt: null } : {}),
    ...(resolvedFilter === "true" ? { disputeResolvedAt: { not: null } } : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { disputeCreatedAt: "desc" },
      skip: (pageParams.page - 1) * pageParams.pageSize,
      take: pageParams.pageSize,
      select: {
        id: true,
        status: true,
        fulfillmentStatus: true,
        deliveryOutcome: true,
        paymentStatus: true,
        totalAmount: true,
        disputeReason: true,
        disputeCreatedAt: true,
        disputeResolvedAt: true,
        disputeResolution: true,
        business: { select: { name: true } },
        user: { select: { email: true } },
        items: { select: { id: true, quantity: true, price: true, deliveryStatus: true, product: { select: { name: true } }, side: { select: { name: true } } } },
        events: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, actorType: true, message: true, createdAt: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return toPageResult(
    orders.map((order) => ({
      id: order.id,
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
      deliveryOutcome: order.deliveryOutcome,
      paymentStatus: order.paymentStatus,
      totalAmount: order.totalAmount,
      businessName: order.business.name,
      buyerEmail: order.user.email,
      disputeReason: order.disputeReason,
      disputeCreatedAt: order.disputeCreatedAt?.toISOString() ?? null,
      disputeResolvedAt: order.disputeResolvedAt?.toISOString() ?? null,
      disputeResolution: order.disputeResolution,
      // Vendor order items may be a Side line (no product) — fall back to
      // the side's name so vendor disputes render correctly here too.
      items: order.items.map((item) => ({ id: item.id, productName: item.product?.name ?? item.side?.name ?? "Unknown item", quantity: item.quantity, price: item.price, deliveryStatus: item.deliveryStatus })),
      events: order.events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    })),
    total,
    pageParams
  );
}
