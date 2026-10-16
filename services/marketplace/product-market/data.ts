// services/marketplace/product-market/data.ts
//
// Mock product listings for the marketplace homepage's "Popular Products"
// section. Stands in for a real /api/marketplace/products?sort=orders
// route backed by prisma/schema.prisma's Product model — there's no such
// route yet, so this is static data shaped like the eventual API response.
// `getPopularProducts()` is the one function the UI calls; swapping this
// for a real fetch later shouldn't require touching any component.

import type { MarketplaceProduct } from "../shared/types";

const IMG = (id: string) => `https://images.unsplash.com/${id}?w=600&q=70&auto=format&fit=crop`;

export const products: MarketplaceProduct[] = [
  { id: "p1", name: "Floral Phone Case", categoryId: "electronics", sellerName: "Plug", price: 4300, orders: 132, image: IMG("photo-1511707171634-5f897ff02aa9") },
  { id: "p2", name: "Campus Sneakers", categoryId: "fashion", sellerName: "SoleHub", price: 18500, orders: 97, image: IMG("photo-1542291026-7eec264c27ff") },
  { id: "p3", name: "Used Textbook Bundle", categoryId: "books", sellerName: "BookSwap", price: 6000, orders: 156, image: IMG("photo-1512820790803-83ca734da794") },
  { id: "p4", name: "LED Desk Lamp", categoryId: "dorm", sellerName: "DormEssentials", price: 7200, orders: 84, image: IMG("photo-1505692952047-1a78307da8f2") },
  { id: "p5", name: "Snack Care Package", categoryId: "food", sellerName: "MunchBox", price: 3500, orders: 210, image: IMG("photo-1599490659213-e2b9527bd087") },
  { id: "p6", name: "Skincare Starter Set", categoryId: "beauty", sellerName: "GlowLab", price: 9800, orders: 63, image: IMG("photo-1522335789203-aabd1fc54bc9") },
  { id: "p7", name: "Resistance Band Set", categoryId: "sports", sellerName: "FitCampus", price: 5400, orders: 41, image: IMG("photo-1518611012118-696072aa579a") },
  { id: "p8", name: "Notebook & Pen Combo", categoryId: "stationery", sellerName: "PaperTrail", price: 2200, orders: 118, image: IMG("photo-1544816155-12df9643f363") },
];

// Highest-`orders` first — a real API route would do this sort server-side.
export function getPopularProducts(limit = 8): MarketplaceProduct[] {
  return [...products].sort((a, b) => b.orders - a.orders).slice(0, limit);
}

// Used by the Explore page to render one products grid per category.
export function getProductsByCategory(categoryId: string): MarketplaceProduct[] {
  return products.filter((product) => product.categoryId === categoryId);
}
