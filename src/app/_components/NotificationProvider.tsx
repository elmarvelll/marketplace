// src/app/_components/NotificationProvider.tsx
//
// The ONE shared notification/event context for the marketplace — mounted
// once in ../layout.tsx so it wraps every page under
// **. Every consumer (NotificationDropdown, and
// anything else that wants notification state later) reads from this
// context instead of opening its own EventSource. Hydrates from
// GET /api/marketplace/notifications on mount, then opens exactly one
// EventSource to the SSE stream (src/app/api/marketplace/notifications/stream/route.ts)
// for anything that arrives after that.
//
// The admin dashboard has its own equivalent instance (see
// src/app/admin/_components/AdminNotificationProvider.tsx),
// scoped to ADMIN notifications — deliberately a second mount of the same
// pattern, not a shared cross-tree provider, since the two trees have
// different layouts/auth boundaries and admins may not always be inside
// the marketplace tree.

"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import api from "@/lib/axios";

export interface AppNotification {
  id: string;
  scope: "MARKETPLACE" | "ADMIN";
  type: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  orderId: string | null;
  businessId: string | null;
  createdAt: string;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const MAX_KEPT = 30;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  // Ref, not just relying on effect-once semantics — React Strict Mode
  // double-invokes effects in dev, and this guard is what keeps that from
  // opening a second EventSource.
  const esRef = useRef<EventSource | null>(null);
  // Every notification id this provider has ever applied to state — the
  // actual idempotency key. A ref (not derived from `notifications`
  // state) so the check is synchronous and can't race against React
  // batching two SSE events that arrive back-to-back: the stream can
  // legitimately deliver the same id twice (its own broadcaster-vs-poll
  // race — see stream/route.ts's own dedup comment — plus this can
  // overlap with the hydrate() fetch below), and a duplicate must be a
  // total no-op, not just a duplicate card but also a wrong unread count.
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const res = await api.get<{ notifications: AppNotification[]; unreadCount: number }>("/marketplace/notifications");
        if (cancelled) return;
        for (const n of res.data.notifications) seenIdsRef.current.add(n.id);
        setNotifications(res.data.notifications);
        setUnreadCount(res.data.unreadCount);
      } catch {
        // Not signed in yet, or a transient failure — the SSE connection
        // below still gets a chance to work; nothing further to do here.
      }
    };
    hydrate();

    if (!esRef.current) {
      const es = new EventSource("/api/marketplace/notifications/stream");
      es.addEventListener("notification", (event) => {
        const notification = JSON.parse((event as MessageEvent).data) as AppNotification;
        if (notification.scope !== "MARKETPLACE") return;
        if (seenIdsRef.current.has(notification.id)) return;
        seenIdsRef.current.add(notification.id);
        setNotifications((current) => [notification, ...current].slice(0, MAX_KEPT));
        setUnreadCount((current) => current + 1);
      });
      esRef.current = es;
    }

    return () => {
      cancelled = true;
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  const markAsRead = (id: string) => {
    setNotifications((current) => current.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((current) => Math.max(0, current - 1));
    void api.post(`/marketplace/notifications/${id}/read`).catch(() => {
      // Best-effort — the read state already updated optimistically; a
      // failed request here just means it'll show unread again on next
      // hydrate, not worth surfacing to the user.
    });
  };

  return <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead }}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationProvider.");
  return ctx;
}
