// services/marketplace/admin/vendor-delivery/list-vendor-bookings.ts
//
// Admin "Vendor Delivery" tab's booking list — one row per
// VendorDeliveryBooking, with every vendor Order/item/buyer/fee detail an
// admin needs to monitor the operation (spec §39). Called by
// src/app/api/marketplace/admin/vendor-delivery/bookings/route.controller.ts.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parsePageParams, toPageResult, type PageResult } from "@/services/marketplace/admin/shared/pagination";

export interface AdminVendorBookingRow {
  id: string;
  status: string;
  bookedFor: string;
  deliveryFee: number;
  serviceFee: number;
  createdAt: string;
  slot: { id: string; label: string; windowStart: string; windowEnd: string };
  buyerEmail: string;
  orders: {
    id: string;
    businessName: string;
    status: string;
    fulfillmentStatus: string | null;
    deliveryOutcome: string;
    totalAmount: number;
    isDisputed: boolean;
    itemCount: number;
  }[];
}

export async function listVendorBookings(searchParams: URLSearchParams): Promise<PageResult<AdminVendorBookingRow>> {
  const pageParams = parsePageParams(searchParams);
  const slotId = searchParams.get("slotId")?.trim() || undefined;
  const status = searchParams.get("status")?.trim() || undefined;
  const dateParam = searchParams.get("date")?.trim();

  const where: Prisma.VendorDeliveryBookingWhereInput = {
    ...(slotId ? { slotId } : {}),
    ...(status ? { status: status as Prisma.EnumVendorBookingStatusFilter["equals"] } : {}),
    ...(dateParam ? { bookedFor: new Date(dateParam) } : {}),
  };

  const [bookings, total] = await Promise.all([
    prisma.vendorDeliveryBooking.findMany({
      where,
      select: {
        id: true,
        status: true,
        bookedFor: true,
        deliveryFee: true,
        serviceFee: true,
        createdAt: true,
        user: { select: { email: true } },
        slot: { select: { id: true, label: true, windowStart: true, windowEnd: true } },
        orders: {
          select: {
            id: true,
            status: true,
            fulfillmentStatus: true,
            deliveryOutcome: true,
            totalAmount: true,
            isDisputed: true,
            business: { select: { name: true } },
            items: { select: { id: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (pageParams.page - 1) * pageParams.pageSize,
      take: pageParams.pageSize,
    }),
    prisma.vendorDeliveryBooking.count({ where }),
  ]);

  return toPageResult(
    bookings.map((booking) => ({
      id: booking.id,
      status: booking.status,
      bookedFor: booking.bookedFor.toISOString(),
      deliveryFee: booking.deliveryFee,
      serviceFee: booking.serviceFee,
      createdAt: booking.createdAt.toISOString(),
      slot: booking.slot,
      buyerEmail: booking.user.email,
      orders: booking.orders.map((order) => ({
        id: order.id,
        businessName: order.business.name,
        status: order.status,
        fulfillmentStatus: order.fulfillmentStatus,
        deliveryOutcome: order.deliveryOutcome,
        totalAmount: order.totalAmount,
        isDisputed: order.isDisputed,
        itemCount: order.items.length,
      })),
    })),
    total,
    pageParams
  );
}
