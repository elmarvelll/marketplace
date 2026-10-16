// services/marketplace/vendor/side/side.service.ts
//
// CRUD for a vendor's universal Sides (add-ons never tied to one Product —
// see prisma/schema.prisma's Side model comment and
// docs/marketplace/decisions/vendor-independent-architecture.md).
// Owner-scoped via requireOwnedVendor, same pattern as Product CRUD.
// Called by src/app/api/marketplace/vendor/[id]/sides/[...]/route.controller.ts.

import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/service-error";
import { requireOwnedBusiness } from "@/services/marketplace/business/business-ownership.service";
import { requireOwnedVendor } from "@/services/marketplace/vendor/shared/require-owned-vendor";

export interface SideFormValues {
  name: string;
  price: number;
  available?: boolean;
  stock?: number | null;
}

function parseSideFields(data: Partial<SideFormValues>) {
  const name = data.name?.trim();
  const price = Number(data.price);
  if (!name) throw badRequest("Side name is required.");
  if (!Number.isFinite(price) || price < 0) throw badRequest("Side price must be a non-negative number.");
  const stock = data.stock === null || data.stock === undefined ? null : Math.max(0, Math.trunc(Number(data.stock)));
  return { name, price, available: data.available ?? true, stock: Number.isFinite(stock) ? stock : null };
}

export async function listSidesForOwner(businessId: string) {
  // Not requireOwnedVendor here — listing must 404/403 for a non-owner
  // regardless of type, but reading is harmless for a plain Business too
  // (it'll just always be empty). Kept as requireOwnedBusiness to avoid an
  // extra query on the common owner-viewing-their-own-vendor path; the
  // mutating actions below (create/update/delete) are the ones that
  // actually need the vendor-type guard.
  await requireOwnedBusiness(businessId);
  return prisma.side.findMany({ where: { businessId }, orderBy: { createdAt: "desc" } });
}

// Public, read-only — the vendor storefront's side list. No ownership
// check; only ever called with an already-approved, non-paused business id
// (see get-vendor-storefront.ts).
export async function listSidesForStorefront(businessId: string) {
  return prisma.side.findMany({ where: { businessId, available: true }, orderBy: { createdAt: "desc" } });
}

export async function createSide(businessId: string, data: Partial<SideFormValues>) {
  await requireOwnedVendor(businessId);
  const fields = parseSideFields(data);
  return prisma.side.create({ data: { ...fields, businessId } });
}

export async function updateSide(businessId: string, sideId: string, data: Partial<SideFormValues>) {
  await requireOwnedVendor(businessId);
  const existing = await prisma.side.findFirst({ where: { id: sideId, businessId } });
  if (!existing) throw notFound("Side not found.");
  const fields = parseSideFields({ ...existing, ...data });
  return prisma.side.update({ where: { id: sideId }, data: fields });
}

export async function deleteSide(businessId: string, sideId: string) {
  await requireOwnedVendor(businessId);
  const existing = await prisma.side.findFirst({ where: { id: sideId, businessId } });
  if (!existing) throw notFound("Side not found.");
  await prisma.side.delete({ where: { id: sideId } });
}
