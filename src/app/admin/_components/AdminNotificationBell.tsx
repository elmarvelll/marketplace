// src/app/admin/_components/AdminNotificationBell.tsx
//
// The admin area's notification bell — mounted once in AdminDomainSidebar
// (so it exists exactly once regardless of which admin domain page is
// active), scoped to ADMIN notifications (new business registrations,
// verification requests, deliverer applications, etc — see
// services/marketplace/notifications/notification.service.ts's
// NotificationScope). Self-contained (fetch + one shared SSE connection +
// dropdown all in one component) since — unlike the marketplace bell —
// there's only ever one place in the app this needs to render, so a
// separate provider/consumer split isn't needed here.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import api from "@/lib/axios";

interface AdminNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  createdAt: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });
const MAX_KEPT = 30;

export default function AdminNotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();
  const esRef = useRef<EventSource | null>(null);
  // Idempotency key set — see NotificationProvider.tsx's identical guard
  // (this bell is a separate, self-contained mount of the same pattern)
  // and src/app/api/marketplace/notifications/stream/route.ts's own
  // dedup comment for why the same notification id can otherwise arrive
  // twice (broadcaster + poll racing, or hydrate + SSE overlapping).
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    api
      .get<{ notifications: AdminNotification[]; unreadCount: number }>("/marketplace/admin/notifications")
      .then((res) => {
        if (cancelled) return;
        for (const n of res.data.notifications) seenIdsRef.current.add(n.id);
        setNotifications(res.data.notifications);
        setUnreadCount(res.data.unreadCount);
      })
      .catch(() => {
        // Not signed in as admin yet, or a transient failure — the SSE
        // connection below still gets a chance to work.
      });

    if (!esRef.current) {
      const es = new EventSource("/api/marketplace/notifications/stream");
      es.addEventListener("notification", (event) => {
        const notification = JSON.parse((event as MessageEvent).data) as AdminNotification & { scope: string };
        if (notification.scope !== "ADMIN") return;
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

  const handleClick = (notification: AdminNotification) => {
    if (!notification.read) {
      setNotifications((current) => current.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      setUnreadCount((current) => Math.max(0, current - 1));
      void api.post(`/marketplace/notifications/${notification.id}/read`).catch(() => {});
    }
    if (notification.link) router.push(notification.link);
    setOpen(false);
  };

  return (
    <div className="relative mb-2" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label="Admin notifications"
        className="relative w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-white transition"
      >
        <Bell size={16} />
        Notifications
        {unreadCount > 0 && (
          <span className="ml-auto min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-semibold leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 top-full mt-1 w-80 max-w-[calc(100vw-2rem)] max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-2xl shadow-xl p-4 z-40"
          >
            <p className="font-semibold text-gray-900 text-sm mb-2">Notifications</p>
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing needs your attention right now.</p>
            ) : (
              <ul className="space-y-1 -mx-2">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleClick(notification)}
                      className={`w-full text-left px-2 py-2 rounded-xl transition ${
                        notification.read ? "hover:bg-gray-50" : "bg-blue-50 hover:bg-blue-100"
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{notification.message}</p>
                      <p className="text-[11px] text-gray-500 mt-1">{dateFormatter.format(new Date(notification.createdAt))}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
