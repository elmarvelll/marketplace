// src/app/components/dashboard/student/DashboardNavbar.tsx
//
// Kept at its AkadVerse path so the extracted pages' imports keep working, but it no longer renders AkadVerse's
// "AkadVerse Marketplace" bar: every page now gets the standalone Marketplace's own navbar (fixed, 4rem tall —
// pages keep their pt-16 offset), which also holds the Admin link and Sign out. See
// src/app/_components/MarketplaceNavbar.tsx.

"use client";

import MarketplaceNavbar from "@/app/_components/MarketplaceNavbar";

export default function DashboardNavbar() {
  return <MarketplaceNavbar />;
}
