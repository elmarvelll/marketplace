// src/app/_components/MarketplacePageShell.tsx
//
// The frame for every Marketplace page that sits under the fixed top navbar
// (DashboardNavbar: `fixed`, 4rem tall) and isn't the storefront itself:
// checkout, vendor checkout, owner dashboards, orders, deliverer, and the
// application forms.
//
// Why this exists: those pages used to put the navbar offset AND their own
// content padding on the SAME element (`pt-16 … py-10 sm:py-14`). From the
// `sm` breakpoint the responsive `sm:py-*` rule wins over `pt-16`, so the
// content started 8–16px underneath the navbar — which is exactly where the
// "Back to Marketplace" link was. Here the offset lives on <main> and the
// padding on an inner element, so one can never cancel the other; pages no
// longer set either themselves.
//
// It also renders the one shared back control (BackLink), so every page has
// the same, clearly visible way back to where it sits in the Marketplace.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import DashboardNavbar from "@/app/components/dashboard/student/DashboardNavbar";

const WIDTH = {
  lg: "max-w-lg",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
} as const;

export const MARKETPLACE_HOME = "/";

// Button-style (bordered, 40px+ tap target) rather than a faint text link, so
// it reads as navigation at a glance on both mobile and desktop. A real link
// (new history entry) — the browser's own Back button keeps working.
export function BackLink({ href = MARKETPLACE_HOME, label = "Back to Marketplace", className = "" }: { href?: string; label?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${className}`}
    >
      <ArrowLeft size={16} className="shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export default function MarketplacePageShell({
  width = "2xl",
  back = { href: MARKETPLACE_HOME, label: "Back to Marketplace" },
  className = "",
  children,
}: {
  width?: keyof typeof WIDTH;
  // Pass `null` for a page that renders its own navigation (or none).
  back?: { href: string; label: string } | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNavbar />
      {/* pt-16 clears the fixed 4rem navbar. Keep it on this element only. */}
      <main className="pt-16">
        <div className={`${WIDTH[width]} mx-auto px-4 sm:px-6 py-6 sm:py-10 ${className}`}>
          {back && (
            <nav aria-label="Breadcrumb" className="mb-6">
              <BackLink href={back.href} label={back.label} />
            </nav>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
