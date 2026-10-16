// services/marketplace/delivery/send-pickup-deadline-reminders.ts
//
// Runs hourly from the pickup-deadline-reminder cron. Finds
// Delivery_x_businesses handoffs whose pickupOtpExpiry (see
// src/lib/otp.ts#buildPickupOtpExpiry, set at assign-delivery.ts time) is
// within the next few hours and haven't been picked up yet, and emails the
// deliverer a reminder — once per handoff, tracked via
// pickupDeadlineReminderSentAt so an hourly re-run doesn't re-send. Called
// by src/app/api/cron/pickup-deadline-reminder/route.ts.

import { prisma } from "@/lib/prisma";
import { sendEmail, delivererPickupDeadlineReminderEmail } from "@/services/marketplace/notifications/email.service";

const REMINDER_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 hours before pickupOtpExpiry

export async function sendPickupDeadlineReminders(): Promise<{ remindersSent: number }> {
  const now = new Date();
  const reminderCutoff = new Date(now.getTime() + REMINDER_WINDOW_MS);

  const handoffs = await prisma.delivery_x_businesses.findMany({
    where: {
      delivererConfirmedPickupAt: null,
      pickupOtpExpiry: { not: null, lte: reminderCutoff, gt: now },
      pickupDeadlineReminderSentAt: null,
    },
    select: {
      id: true,
      pickupOtpExpiry: true,
      business: { select: { name: true } },
      deliveryman: { select: { firstName: true, email: true } },
    },
  });

  let sent = 0;
  for (const handoff of handoffs) {
    void sendEmail({
      to: handoff.deliveryman.email,
      ...delivererPickupDeadlineReminderEmail({
        delivererName: handoff.deliveryman.firstName,
        businessName: handoff.business.name,
        deadline: handoff.pickupOtpExpiry!.toLocaleString(),
      }),
    });
    await prisma.delivery_x_businesses.update({ where: { id: handoff.id }, data: { pickupDeadlineReminderSentAt: now } });
    sent++;
  }

  return { remindersSent: sent };
}
