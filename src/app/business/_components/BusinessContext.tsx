// src/app/business/_components/BusinessContext.tsx
//
// BusinessApprovalGate.tsx already fetches this business's full detail
// (GET /api/marketplace/businesses/[id]) once, to decide whether to show
// the approval gate or the real dashboard. Any read-only tab nested inside
// it (Products — for the "Add Sides" vendor-type check) should read that
// same object via this context instead of independently re-fetching it,
// which would just be a duplicate network round-trip for data the gate
// already has in memory. Profile/Analytics keep their own
// useBusinessDetail() call instead of this context — they need local
// mutable state (setBusiness) for optimistic updates after a PATCH save,
// which a shared read-only context doesn't support; that's a pre-existing
// duplicate fetch, not one this context is meant to fix.

import { createContext, useContext } from "react";
import type { BusinessDetail } from "@/types/business";

export const BusinessContext = createContext<BusinessDetail | null>(null);

export function useBusinessContext(): BusinessDetail | null {
  return useContext(BusinessContext);
}
