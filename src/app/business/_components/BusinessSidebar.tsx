// src/app/business/_components/BusinessSidebar.tsx
//
// Left sidebar for a single business's dashboard
// (business/[id]/layout.tsx wraps every tab in this): Profile, Products,
// Orders, Analytics.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Package, ShoppingBag, UserRound } from "lucide-react";

export default function BusinessSidebar({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/business/${id}`;

  const links = [
    { href: base, label: "Business Profile", icon: UserRound, exact: true },
    { href: `${base}/products`, label: "Products", icon: Package, exact: false },
    { href: `${base}/orders`, label: "Orders", icon: ShoppingBag, exact: false },
    { href: `${base}/analytics`, label: "Analytics", icon: BarChart3, exact: false },
  ];

  return (
    <aside className="w-full sm:w-56 shrink-0 space-y-1">
      {links.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
              active ? "bg-blue-50 text-blue-600" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <Icon size={17} className="shrink-0" />
            {label}
          </Link>
        );
      })}
    </aside>
  );
}
