// src/app/business/[id]/layout.tsx
//
// Shell shared by every tab of a business's dashboard (page.tsx = Profile,
// products/, orders/, analytics/): the top navbar, a back link, and
// (once BusinessApprovalGate confirms the business is APPROVED) the
// BusinessSidebar. Each tab still fetches its own data client-side (see
// _components/useBusinessDetail.ts and the per-tab pages) — this layout
// itself doesn't fetch anything beyond what the gate needs, just provides
// the frame.

import BusinessApprovalGate from "../_components/BusinessApprovalGate";
import MarketplacePageShell from "@/app/_components/MarketplacePageShell";

// Navbar offset + the shared "Back to Marketplace" control come from
// MarketplacePageShell — see that file for why they must not be re-added here.
export default async function BusinessDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <MarketplacePageShell width="6xl" className="flex flex-col">

        <BusinessApprovalGate id={id}>{children}</BusinessApprovalGate>
    </MarketplacePageShell>
  );
}
