// src/app/admin/_components/AdminMainMenu.tsx
//
// The admin-only equivalent of a normal nav menu — every tab here is
// server-side gated by requireAdmin() on its own API calls regardless of
// how the URL is reached; this menu is navigation only, never the
// security boundary. See docs/marketplace/systems/admin-system.md.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/verifications", label: "Verifications" },
  { href: "/admin/disputes", label: "Disputes" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/fines", label: "Fines" },
  { href: "/admin/businesses", label: "Businesses" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/reports", label: "Reports" },
  // School Vendor delivery operations — see
  // docs/marketplace/systems/vendor-delivery-system.md. An admin
  // capability/tab, not a new global role (spec §38).
  { href: "/admin/vendor-delivery", label: "Vendor Delivery" },
  // Recurring weekly delivery roster for both operations — see
  // services/marketplace/delivery-roster/.
  { href: "/admin/delivery-roster", label: "Delivery Roster" },
  // Day-to-day Vendor Market delivery control center (vendor manager = admin).
  { href: "/admin/delivery-operations", label: "Delivery Operations" },
];

export default function AdminMainMenu() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 mb-6">
      {TABS.map((tab) => {
        // Overview's own href ("/admin") must only match exactly — every
        // other tab's href is also a prefix of its own nested/dynamic
        // routes (e.g. a future /admin/businesses/[id]), so those match on
        // startsWith.
        const active = tab.label === "Overview" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition ${
              active ? "bg-blue-600 text-white" : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
