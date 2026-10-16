// src/app/admin/layout.tsx
//
// Shell for the Marketplace admin dashboard. In AkadVerse this lived at /studashboard/admin/marketplace beneath a
// multi-domain admin area (E-Learning, AI Studio, …); the standalone app has only the Marketplace section, so its
// tab menu is the admin navigation. The navbar offset sits on <main> and the padding on the inner element (the same
// rule as MarketplacePageShell). Access is enforced by src/proxy.ts for pages and by requireAdmin() in every admin API.

import DashboardNavbar from "@/app/components/dashboard/student/DashboardNavbar";
import { BackLink } from "@/app/_components/MarketplacePageShell";
import AdminMainMenu from "./_components/AdminMainMenu";

export const metadata = { title: "Admin" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNavbar />
      <main className="pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          <nav aria-label="Breadcrumb" className="mb-6">
            <BackLink />
          </nav>
          <AdminMainMenu />
          {children}
        </div>
      </main>
    </div>
  );
}
