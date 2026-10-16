// src/app/_components/search-params.ts
//
// Builds the /explore URL for a given search (query text + side + selected
// category filters). Shared by MarketplaceNavbar.tsx (which triggers
// searches) and explore/page.tsx (which builds "remove this filter"
// links from the same three pieces of state).

import type { MarketplaceSide } from "@/services/marketplace/shared/types";
import { SKILLS_ENABLED } from "./marketplace-features";

export function buildExploreHref(query: string, side: MarketplaceSide, categoryIds: string[]): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  // With Skills hidden there is no skills side to search (a stale ?side=skills link is ignored by /explore too).
  if (SKILLS_ENABLED && side === "skills") params.set("side", "skills");
  if (categoryIds.length > 0) params.set("categories", categoryIds.join(","));

  const qs = params.toString();
  return `/explore${qs ? `?${qs}` : ""}`;
}
