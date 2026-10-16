// src/app/vendor-dashboard/[id]/layout.tsx
//
// Shell shared by every tab of a vendor's OWN dashboard (page.tsx =
// Profile+capacity, products/, sides/, orders/): the top navbar, a back
// link, and (once VendorApprovalGate confirms the vendor is APPROVED) the
// VendorSidebar. Deliberately its own route tree, not nested under
// business/[id] — Vendor is a structurally independent feature (spec §1,
// §14; see
// docs/marketplace/decisions/vendor-independent-architecture.md), not a
// conditional inside the Business dashboard. The public storefront lives
// separately at vendor/[id] and is untouched.

import VendorApprovalGate from "../_components/VendorApprovalGate";
import MarketplacePageShell from "@/app/_components/MarketplacePageShell";

// Navbar offset + the shared "Back to Marketplace" control come from
// MarketplacePageShell — see that file for why they must not be re-added here.
export default async function VendorDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <MarketplacePageShell width="6xl" className="flex flex-col">

        <VendorApprovalGate id={id}>{children}</VendorApprovalGate>
    </MarketplacePageShell>
  );
}
