// services/marketplace/delivery/send-daily-schedule-emails.ts
//
// Runs from the delivery-schedule cron (12:00 AM). Emails each approved
// deliverer with deliveries confirmed for today. Called by
// src/app/api/cron/delivery-schedule/route.ts.

import { prisma } from "@/lib/prisma";
import { formatEstimatedDelivery } from "@/services/marketplace/delivery/estimated-delivery.service";
import { sendEmail, delivererDailyScheduleEmail } from "@/services/marketplace/notifications/email.service";

export async function sendDailyScheduleEmails(): Promise<{ deliverersEmailed: number }> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setHours(23, 59, 59, 999);

  const deliverers = await prisma.deliverer.findMany({
    where: { status: "APPROVED" },
    select: {
      id: true,
      firstName: true,
      email: true,
      deliveries: {
        where: { expectedDeliveryAt: { gte: startOfDay, lte: endOfDay } },
        select: {
          items: {
            select: {
              orderItem: { select: { orderId: true, order: { select: { estimatedDeliveryAt: true, deliveryWindowStart: true, deliveryWindowEnd: true } } } },
            },
          },
        },
      },
    },
  });

  let emailed = 0;
  for (const deliverer of deliverers) {
    const entries = deliverer.deliveries.flatMap((delivery) =>
      delivery.items
        .filter((item) => item.orderItem.order.estimatedDeliveryAt && item.orderItem.order.deliveryWindowStart && item.orderItem.order.deliveryWindowEnd)
        .map((item) => {
          const { date, window } = formatEstimatedDelivery({
            estimatedDeliveryAt: item.orderItem.order.estimatedDeliveryAt!,
            deliveryWindowStart: item.orderItem.order.deliveryWindowStart!,
            deliveryWindowEnd: item.orderItem.order.deliveryWindowEnd!,
          });
          return { orderId: item.orderItem.orderId, date, window };
        })
    );

    if (entries.length === 0) continue;

    void sendEmail({ to: deliverer.email, ...delivererDailyScheduleEmail({ delivererName: deliverer.firstName, entries }) });
    emailed++;
  }

  return { deliverersEmailed: emailed };
}
