// src/app/vendor-dashboard/_components/VendorSidebar.tsx
//
// Left sidebar for a single vendor's OWN dashboard
// (vendor-dashboard/[id]/layout.tsx wraps every tab in this): Profile,
// Products, Sides, Orders. Deliberately a vendor-owned file, not a shared
// instance of business/_components/BusinessSidebar.tsx — see
// docs/marketplace/decisions/vendor-independent-architecture.md (Vendor
// is a structurally independent feature, not a conditional inside the
// Business dashboard).

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, ShoppingBag, UserRound, UtensilsCrossed } from "lucide-react";

export default function VendorSidebar({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/vendor-dashboard/${id}`;

  const links = [
    { href: base, label: "Vendor Profile", icon: UserRound, exact: true },
    { href: `${base}/products`, label: "Products", icon: Package, exact: false },
    { href: `${base}/sides`, label: "Sides", icon: UtensilsCrossed, exact: false },
    { href: `${base}/orders`, label: "Orders", icon: ShoppingBag, exact: false },
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
              active ? "bg-purple-50 text-purple-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
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
