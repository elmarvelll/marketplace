// src/app/_components/AppNotifications.tsx
//
// Wraps the signed-in part of the app in the notification provider (bell + live stream). In AkadVerse this provider
// was the Marketplace section's own layout; here the Marketplace IS the app, so it sits at the root — except on the
// sign-in / sign-up / password pages, where there is no session and it would only produce failing requests.

"use client";

import { usePathname } from "next/navigation";
import { NotificationProvider } from "./NotificationProvider";

const AUTH_PAGES = ["/login", "/signup"];

export function AppNotifications({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (AUTH_PAGES.includes(pathname)) return <>{children}</>;
  return <NotificationProvider>{children}</NotificationProvider>;
}
