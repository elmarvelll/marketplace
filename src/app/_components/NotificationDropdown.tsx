// src/app/_components/NotificationDropdown.tsx
//
// Navbar notification bell. Reads from NotificationProvider's shared
// context (one EventSource for the whole marketplace session — see that
// file) rather than fetching/subscribing itself. Clicking a notification
// marks it read and navigates to its target. Opens on hover with a mouse
// and on tap on touch screens (./use-dropdown.ts).

"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { useNotifications } from "./NotificationProvider";
import { useDropdown } from "./use-dropdown";

const dateFormatter = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" });

export default function NotificationDropdown() {
  const { open, setOpen, containerProps, buttonProps } = useDropdown();
  const router = useRouter();
  const { notifications, unreadCount, markAsRead } = useNotifications();

  const handleClick = (notification: (typeof notifications)[number]) => {
    if (!notification.read) markAsRead(notification.id);
    if (notification.link) router.push(notification.link);
    setOpen(false);
  };

  return (
    <div className="relative" {...containerProps}>
      <button
        type="button"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        {...buttonProps}
        className="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-50 text-gray-700 transition focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        <Bell size={19} aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-semibold leading-none">
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
            className="fixed left-4 right-4 top-[4.5rem] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 max-h-[75vh] sm:max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-2xl shadow-xl p-4 z-40"
          >
            <p className="font-semibold text-gray-900 text-sm mb-2">Notifications</p>
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-500">You&apos;re all caught up — no notifications yet.</p>
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
