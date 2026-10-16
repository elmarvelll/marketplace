// services/marketplace/skills-market/data.ts
//
// Mock data backing the marketplace homepage's "Popular Skills", "Top
// Businesses", and "Best Services" sections. Stands in for real
// /api/marketplace/* routes over prisma/schema.prisma's Skill/Business
// models (order counts would come from the Order table) — none of that
// exists yet, so these `get*()` functions are the seam where a real fetch
// would slot in later.

import type { MarketplaceBusiness, MarketplaceServiceProvider, MarketplaceSkill } from "../shared/types";

const IMG = (id: string) => `https://images.unsplash.com/${id}?w=600&q=70&auto=format&fit=crop`;

export const skills: MarketplaceSkill[] = [
  { id: "s1", name: "Logo & Brand Design", categoryId: "graphic-design", providerName: "Ada Creates", startingPrice: 15000, orders: 74, image: IMG("photo-1555041469-a586c61ea9bc") },
  { id: "s2", name: "Calculus Tutoring", categoryId: "tutoring", providerName: "Chidi Tutors", startingPrice: 5000, orders: 121, image: IMG("photo-1495474472287-4d71bcdd2085") },
  { id: "s3", name: "Essay Editing", categoryId: "writing", providerName: "WordSmith", startingPrice: 3500, orders: 58, image: IMG("photo-1516321318423-f06f85e504b3") },
  { id: "s4", name: "Portfolio Website Build", categoryId: "development", providerName: "DevDesk", startingPrice: 40000, orders: 33, image: IMG("photo-1571019613454-1cb2f99b2d8b") },
  { id: "s5", name: "Event Photography", categoryId: "photography", providerName: "Lens & Co", startingPrice: 20000, orders: 46, image: IMG("photo-1522202176988-66273c2fd55f") },
  { id: "s6", name: "Beat Making", categoryId: "music", providerName: "StudioNaija", startingPrice: 10000, orders: 29, image: IMG("photo-1546519638-68e109498ffc") },
  { id: "s7", name: "Custom Outfit Tailoring", categoryId: "fashion-design", providerName: "StitchWorks", startingPrice: 12000, orders: 37, image: IMG("photo-1517842645767-c639042777db") },
  { id: "s8", name: "Birthday Event Planning", categoryId: "event-planning", providerName: "PartyPlug", startingPrice: 25000, orders: 22, image: IMG("photo-1493225457124-a3eb161ffa5f") },
];

export const businesses: MarketplaceBusiness[] = [
  { id: "b1", name: "MunchBox", industry: "Food & Snacks", ordersFulfilled: 210, image: IMG("photo-1599490659213-e2b9527bd087") },
  { id: "b2", name: "BookSwap", industry: "Books & Study Materials", ordersFulfilled: 156, image: IMG("photo-1512820790803-83ca734da794") },
  { id: "b3", name: "Plug", industry: "Electronics & Gadgets", ordersFulfilled: 132, image: IMG("photo-1511707171634-5f897ff02aa9") },
  { id: "b4", name: "PaperTrail", industry: "Stationery & Supplies", ordersFulfilled: 118, image: IMG("photo-1544816155-12df9643f363") },
];

export const serviceProviders: MarketplaceServiceProvider[] = [
  { id: "sp1", name: "Chidi Tutors", skillName: "Tutoring & Academic Help", ordersFulfilled: 121, image: IMG("photo-1495474472287-4d71bcdd2085") },
  { id: "sp2", name: "Ada Creates", skillName: "Graphic Design", ordersFulfilled: 74, image: IMG("photo-1555041469-a586c61ea9bc") },
  { id: "sp3", name: "WordSmith", skillName: "Writing & Editing", ordersFulfilled: 58, image: IMG("photo-1516321318423-f06f85e504b3") },
  { id: "sp4", name: "Lens & Co", skillName: "Photography & Videography", ordersFulfilled: 46, image: IMG("photo-1522202176988-66273c2fd55f") },
];

export function getPopularSkills(limit = 8): MarketplaceSkill[] {
  return [...skills].sort((a, b) => b.orders - a.orders).slice(0, limit);
}

export function getTopBusinesses(limit = 4): MarketplaceBusiness[] {
  return [...businesses].sort((a, b) => b.ordersFulfilled - a.ordersFulfilled).slice(0, limit);
}

export function getBestServices(limit = 4): MarketplaceServiceProvider[] {
  return [...serviceProviders].sort((a, b) => b.ordersFulfilled - a.ordersFulfilled).slice(0, limit);
}

// Used by the Explore page to render one skills grid per category.
export function getSkillsByCategory(categoryId: string): MarketplaceSkill[] {
  return skills.filter((skill) => skill.categoryId === categoryId);
}

// The Skills side of the navbar's search box + FilterDropdown. There's no
// Skill API route yet (see the file header), so this just filters the mock
// array in-memory rather than making a request — same query/category
// filtering GET /api/marketplace/search/products does for real products.
export function searchSkills(query: string, categoryIds: string[]): MarketplaceSkill[] {
  const q = query.trim().toLowerCase();
  return skills.filter((skill) => {
    const matchesQuery = !q || skill.name.toLowerCase().includes(q) || skill.providerName.toLowerCase().includes(q);
    const matchesCategory = categoryIds.length === 0 || categoryIds.includes(skill.categoryId);
    return matchesQuery && matchesCategory;
  });
}
