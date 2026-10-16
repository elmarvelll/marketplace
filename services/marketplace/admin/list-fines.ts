// services/marketplace/admin/list-fines.ts
//
// Every late-delivery fine, joined to the business and its owner, so an
// admin can answer "who was fined, why, how much, was it paid, and when"
// from one row. `status`/`paidAt`/`paystackReference` are the real,
// server-verified fields written by
// services/marketplace/fines/confirm-fine-payment.ts (payment status is
// never taken on the frontend's word — see
// docs/marketplace/security/payment-security.md). Called by
// src/app/api/marketplace/admin/fines/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { parsePageParams, toPageResult, type PageResult } from "./shared/pagination";

export interface AdminFineRow {
  id: string;
  orderId: string | null;
  businessName: string;
  ownerEmail: string;
  amount: number;
  status: string;
  paystackReference: string | null;
  paidAt: string | null;
  createdAt: string;
}

export async function listFines(searchParams: URLSearchParams): Promise<PageResult<AdminFineRow>> {
  const pageParams = parsePageParams(searchParams);
  const status = searchParams.get("status"); // "PENDING" | "PAID" | null

  const where = status ? { status: status as "PENDING" | "PAID" } : {};

  const [fines, total] = await Promise.all([
    prisma.lateDeliveryFine.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageParams.page - 1) * pageParams.pageSize,
      take: pageParams.pageSize,
      select: {
        id: true,
        orderId: true,
        amount: true,
        status: true,
        paystackReference: true,
        paidAt: true,
        createdAt: true,
        business: { select: { name: true, user: { select: { email: true } } } },
      },
    }),
    prisma.lateDeliveryFine.count({ where }),
  ]);

  return toPageResult(
    fines.map((fine) => ({
      id: fine.id,
      orderId: fine.orderId,
      businessName: fine.business.name,
      ownerEmail: fine.business.user.email,
      amount: fine.amount,
      status: fine.status,
      paystackReference: fine.paystackReference,
      paidAt: fine.paidAt?.toISOString() ?? null,
      createdAt: fine.createdAt.toISOString(),
    })),
    total,
    pageParams
  );
}
