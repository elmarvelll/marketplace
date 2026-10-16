// services/marketplace/shared/types.ts
//
// Shared shapes for the student marketplace. Everything under
// services/marketplace/ is currently backed by static mock data (see the
// sibling data.ts files) rather than the real Prisma models
// (Product/Skill/Business in prisma/schema.prisma) — those tables exist,
// but there's no /api/marketplace/* route wired up yet. These types are
// intentionally shaped close to the Prisma models so swapping the mock
// `get*()` functions for real fetches later shouldn't require touching the
// UI components that consume them.

import type { LucideIcon } from "lucide-react";

export type MarketplaceSide = "products" | "skills";

export interface MarketplaceCategory {
  id: string;
  name: string;
  icon: LucideIcon;
  subcategories: string[];
}

export interface MarketplaceProduct {
  id: string;
  name: string;
  categoryId: string;
  sellerName: string;
  price: number;
  orders: number;
  image: string;
}

export interface MarketplaceSkill {
  id: string;
  name: string;
  categoryId: string;
  providerName: string;
  startingPrice: number;
  orders: number;
  image: string;
}

export interface MarketplaceBusiness {
  id: string;
  name: string;
  industry: string;
  ordersFulfilled: number;
  image: string;
}

export interface MarketplaceServiceProvider {
  id: string;
  name: string;
  skillName: string;
  ordersFulfilled: number;
  image: string;
}

export interface CartLine {
  id: string;
  productName: string;
  sellerName: string;
  price: number;
  quantity: number;
  image: string;
}
