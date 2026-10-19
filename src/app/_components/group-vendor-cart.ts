// src/app/_components/group-vendor-cart.ts
//
// Vendor cart lines grouped the way they're ordered: one group per vendor
// (each becomes one vendor order at checkout), its main items first and its
// sides in their own sub-list, so sides read as part of the vendor's order
// rather than as separate orders. A side line has no link to a particular
// main item (CartItem has no parent column), so sides are grouped per vendor.
// Groups keep the cart's own order (first line of each vendor decides it).

import type { VendorCartLineItem } from "@/types/vendor-cart";

export interface VendorCartGroup {
  businessId: string;
  vendorName: string;
  mains: VendorCartLineItem[];
  sides: VendorCartLineItem[];
}

export function groupVendorCart(items: VendorCartLineItem[]): VendorCartGroup[] {
  const groups = new Map<string, VendorCartGroup>();
  for (const item of items) {
    let group = groups.get(item.businessId);
    if (!group) {
      group = { businessId: item.businessId, vendorName: item.vendorName, mains: [], sides: [] };
      groups.set(item.businessId, group);
    }
    (item.kind === "side" ? group.sides : group.mains).push(item);
  }
  return Array.from(groups.values());
}
