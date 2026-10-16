// services/marketplace/business/owner-dashboard-path.ts
//
// The ONE place that knows where a business owner manages a given Business
// row. A School Vendor is a Business row with type SCHOOL_VENDOR whose owner
// dashboard is a separate route tree (vendor-dashboard/[id]); the Business
// dashboard API deliberately 404s for it (get-business-detail.ts filters
// type: "BUSINESS"). Hardcoding /business/[id] in a notification therefore
// sent every vendor owner to "This business doesn't exist, or isn't yours."
// Every notification/email link to an owner page must come from here.

import type { BusinessType } from "@prisma/client";

export function ownerDashboardPath(business: { id: string; type: BusinessType }, tab?: "orders" | "products"): string {
  const base =
    business.type === "SCHOOL_VENDOR"
      ? `/vendor-dashboard/${business.id}`
      : `/business/${business.id}`;
  return tab ? `${base}/${tab}` : base;
}
