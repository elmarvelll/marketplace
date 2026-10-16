// services/marketplace/notifications/notification.service.ts
//
// The single writer for the Notification model — every server-side action
// anywhere in the app that needs to notify a user calls createNotification
// (or notifyAdmins for admin-scope fan-out) rather than touching
// prisma.notification directly. Persists to the DB first (source of
// truth), then publishes to the SSE broadcaster so an already-open
// connection updates immediately. See
// src/app/api/marketplace/notifications/stream/route.ts and
// sse-broadcaster.ts.

import { prisma } from "@/lib/prisma";
import { publish } from "./sse-broadcaster";
import type { NotificationScope } from "@prisma/client";

export interface CreateNotificationInput {
  recipientId: string;
  scope?: NotificationScope;
  type: string;
  title: string;
  message: string;
  targetUrl?: string;
  orderId?: string;
  businessId?: string;
}

export interface NotificationDto {
  id: string;
  scope: NotificationScope;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  orderId: string | null;
  businessId: string | null;
  createdAt: string;
}

function toDto(row: {
  id: string;
  scope: NotificationScope;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  orderId: string | null;
  businessId: string | null;
  createdAt: Date;
}): NotificationDto {
  return {
    id: row.id,
    scope: row.scope,
    type: row.type,
    title: row.title,
    message: row.message,
    read: row.read,
    link: row.link,
    orderId: row.orderId,
    businessId: row.businessId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createNotification(input: CreateNotificationInput): Promise<NotificationDto> {
  const row = await prisma.notification.create({
    data: {
      userId: input.recipientId,
      scope: input.scope ?? "MARKETPLACE",
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.targetUrl,
      orderId: input.orderId,
      businessId: input.businessId,
    },
  });
  const dto = toDto(row);
  publish(input.recipientId, dto);
  return dto;
}

// Fan-out helper for admin-scope events (new business registration,
// verification request, deliverer application) — every user with
// isAdmin:true gets their own Notification row so each admin's own
// read/unread state is independent.
export async function notifyAdmins(input: Omit<CreateNotificationInput, "recipientId" | "scope">): Promise<void> {
  const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
  await Promise.all(admins.map((admin) => createNotification({ ...input, recipientId: admin.id, scope: "ADMIN" })));
}

export async function listNotifications(userId: string, scope: NotificationScope, limit = 30) {
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: { userId, scope }, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.notification.count({ where: { userId, scope, read: false } }),
  ]);
  return { notifications: notifications.map(toDto), unreadCount };
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  // Scoped to userId too, not just the id — a user must never be able to
  // mark someone else's notification as read by guessing its id.
  await prisma.notification.updateMany({ where: { id: notificationId, userId }, data: { read: true } });
}
