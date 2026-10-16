// src/app/vendor-dashboard/_components/VendorContext.tsx
//
// VendorApprovalGate.tsx already fetches this vendor's full profile once,
// to decide whether to show the approval gate or the real dashboard. Any
// read-only tab nested inside it (Products, Sides, Orders) should read
// that same object via this context instead of independently re-fetching
// it — see business/_components/BusinessContext.tsx for the identical
// pattern (and the duplicate-fetch bug it was introduced to fix) on the
// Business side.

import { createContext, useContext } from "react";
import type { VendorProfile } from "./VendorApprovalGate";

export const VendorContext = createContext<VendorProfile | null>(null);

export function useVendorContext(): VendorProfile | null {
  return useContext(VendorContext);
}
