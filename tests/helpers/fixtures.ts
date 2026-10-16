// tests/helpers/fixtures.ts
//
// Small builders for the rows marketplace tests need. Every email/name is
// unique per call so tests don't depend on each other or on a clean database.

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { akadverseDb } from "./akadverse";

const uid = () => randomUUID().slice(0, 8);

// An AkadVerse account, created the way AkadVerse's sign-up does (as the owner — the Marketplace's role can't).
// `password` is stored as a bcrypt hash; without one the account has AkadVerse's empty "Google-only" password.
export async function makeUser(overrides: { isAdmin?: boolean; email?: string; password?: string; role?: "student" | "faculty" } = {}) {
  const id = uid();
  return akadverseDb.user.create({
    data: {
      firstName: "Test",
      lastName: id,
      email: overrides.email ?? `user-${id}@stu.cu.edu.ng`,
      password: overrides.password ? await bcrypt.hash(overrides.password, 4) : "",
      role: overrides.role ?? "student",
      isAdmin: overrides.isAdmin ?? false,
    },
  });
}

export async function makeBusiness(ownerId: string, overrides: { type?: "BUSINESS" | "SCHOOL_VENDOR"; approvalStatus?: "APPROVED" | "PENDING_APPROVAL"; blocked?: boolean } = {}) {
  return prisma.business.create({
    data: {
      name: `Shop ${uid()}`,
      industry: "Food",
      description: "Test business",
      userId: ownerId,
      type: overrides.type ?? "BUSINESS",
      approvalStatus: overrides.approvalStatus ?? "APPROVED",
      blocked: overrides.blocked ?? false,
    },
  });
}

export async function makeProduct(businessId: string, overrides: { stock?: number; price?: number } = {}) {
  return prisma.product.create({
    data: { name: `Product ${uid()}`, category: "Food", description: "Test product", price: overrides.price ?? 1500, stock: overrides.stock ?? 5, businessId },
  });
}

export async function addToCart(userId: string, productId: string, quantity = 1) {
  return prisma.cartItem.create({ data: { userId, productId, quantity } });
}

export async function makeSlot(overrides: { windowStart?: string; windowEnd?: string; bookingCutoffMins?: number } = {}) {
  return prisma.vendorDeliverySlot.create({
    data: {
      label: `Slot ${uid()}`,
      // Late-evening window with no cutoff so "tomorrow" is always bookable in tests.
      windowStart: overrides.windowStart ?? "23:00",
      windowEnd: overrides.windowEnd ?? "23:59",
      bookingCutoffMins: overrides.bookingCutoffMins ?? 0,
    },
  });
}

// YYYY-MM-DD, `days` from today in Africa/Lagos (the marketplace's delivery timezone).
export function lagosDatePlus(days: number): string {
  const now = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// A buyer with one product in their cart from an approved Business.
export async function businessCheckoutScenario({ stock = 5, price = 1500, quantity = 1 } = {}) {
  const [buyer, owner] = await Promise.all([makeUser(), makeUser()]);
  const business = await makeBusiness(owner.id);
  const product = await makeProduct(business.id, { stock, price });
  const cartItem = await addToCart(buyer.id, product.id, quantity);
  return { buyer, owner, business, product, cartItem };
}

// A buyer with one product in their Vendor cart, a slot, and vendor capacity for it.
export async function vendorCheckoutScenario({ stock = 5, price = 2000, capacity = 3 } = {}) {
  const [buyer, owner] = await Promise.all([makeUser(), makeUser()]);
  const vendor = await makeBusiness(owner.id, { type: "SCHOOL_VENDOR" });
  const product = await makeProduct(vendor.id, { stock, price });
  const slot = await makeSlot();
  await prisma.vendorTimeframeCapacity.create({ data: { businessId: vendor.id, slotId: slot.id, capacity } });
  const cartItem = await addToCart(buyer.id, product.id, 1);
  return { buyer, owner, vendor, product, slot, cartItem, date: lagosDatePlus(1) };
}

export const stockOf = async (productId: string) => (await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { stock: true } })).stock;
