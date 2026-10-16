// services/marketplace/shared/categories.ts
//
// The 10 product categories + 10 skill categories shown in the marketplace
// navbar's Filter dropdown (see _components/FilterDropdown.tsx) and on the
// Explore page. Static for now — there's no Category/SkillType API route
// yet (see prisma/schema.prisma's Category and SkillType models), so this
// is the single source of truth both places read from.

import {
  Smartphone,
  Shirt,
  BookOpen,
  Home,
  UtensilsCrossed,
  Sparkles,
  Dumbbell,
  PenTool,
  Armchair,
  Ticket,
  Palette,
  GraduationCap,
  FileText,
  Code,
  Camera,
  Music,
  Scissors,
  CalendarCheck,
  Megaphone,
  HeartPulse,
} from "lucide-react";
import type { MarketplaceCategory } from "./types";

export const productCategories: MarketplaceCategory[] = [
  { id: "electronics", name: "Electronics & Gadgets", icon: Smartphone, subcategories: ["Phones & Accessories", "Laptops & Tablets", "Chargers & Cables"] },
  { id: "fashion", name: "Fashion & Accessories", icon: Shirt, subcategories: ["Clothing", "Shoes", "Bags & Jewelry"] },
  { id: "books", name: "Books & Study Materials", icon: BookOpen, subcategories: ["Textbooks", "Past Questions", "Novels"] },
  { id: "dorm", name: "Room & Dorm Essentials", icon: Home, subcategories: ["Bedding", "Storage", "Décor"] },
  { id: "food", name: "Food & Snacks", icon: UtensilsCrossed, subcategories: ["Snacks", "Drinks", "Meal Prep"] },
  { id: "beauty", name: "Beauty & Personal Care", icon: Sparkles, subcategories: ["Skincare", "Haircare", "Fragrance"] },
  { id: "sports", name: "Sports & Fitness", icon: Dumbbell, subcategories: ["Gym Gear", "Sportswear", "Equipment"] },
  { id: "stationery", name: "Stationery & Supplies", icon: PenTool, subcategories: ["Notebooks", "Art Supplies", "Office Tools"] },
  { id: "furniture", name: "Furniture", icon: Armchair, subcategories: ["Chairs & Desks", "Shelving", "Small Furniture"] },
  { id: "tickets", name: "Tickets & Events", icon: Ticket, subcategories: ["Concerts", "Campus Events", "Movie Tickets"] },
];

export const skillCategories: MarketplaceCategory[] = [
  { id: "graphic-design", name: "Graphic Design", icon: Palette, subcategories: ["Logo Design", "Flyers & Posters", "Social Media Graphics"] },
  { id: "tutoring", name: "Tutoring & Academic Help", icon: GraduationCap, subcategories: ["Exam Prep", "Assignment Help", "Project Guidance"] },
  { id: "writing", name: "Writing & Editing", icon: FileText, subcategories: ["Essay Writing", "Proofreading", "Copywriting"] },
  { id: "development", name: "Web & App Development", icon: Code, subcategories: ["Websites", "Mobile Apps", "Automation Scripts"] },
  { id: "photography", name: "Photography & Videography", icon: Camera, subcategories: ["Event Photography", "Portraits", "Video Editing"] },
  { id: "music", name: "Music & Audio Production", icon: Music, subcategories: ["Beat Making", "Mixing & Mastering", "Vocals"] },
  { id: "fashion-design", name: "Fashion Design & Tailoring", icon: Scissors, subcategories: ["Custom Outfits", "Alterations", "Accessories"] },
  { id: "event-planning", name: "Event Planning", icon: CalendarCheck, subcategories: ["Birthday Parties", "Campus Events", "Decoration"] },
  { id: "social-media", name: "Social Media Management", icon: Megaphone, subcategories: ["Content Creation", "Page Management", "Ads"] },
  { id: "fitness-coaching", name: "Fitness Coaching", icon: HeartPulse, subcategories: ["Personal Training", "Nutrition Plans", "Group Classes"] },
];
