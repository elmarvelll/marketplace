// services/marketplace/checkout/shared/stock-reservation.ts
//
// Stock is RESERVED (decremented) when a checkout is initialized, so two
// buyers can't both pay for the last unit, and RELEASED (incremented back)
// exactly once if that checkout is cancelled, fails, or expires. Both halves
// live here so the "which stock column does a line use" rule can't drift
// between them:
//   variantId set              -> ProductVariant.stock
//   productId set, no variant  -> Product.stock
//   sideId set                 -> Side.stock, only when it's tracked (non-null)
//
// reserveLine is a conditional decrement (`stock >= quantity` in the WHERE),
// so it is safe under concurrent checkouts at any isolation level — the
// database refuses the update instead of letting stock go negative. The old
// read-then-decrement pattern in create-orders-for-checkout.ts could oversell
// under READ COMMITTED.

import type { Db } from "@/services/marketplace/order/shared/db";

export interface StockLine {
  productId: string | null;
  variantId: string | null;
  sideId: string | null;
  quantity: number;
}

// Returns false (and writes nothing) when there isn't enough stock.
export async function reserveLine(db: Db, line: StockLine): Promise<boolean> {
  if (line.quantity <= 0) return false;
  if (line.variantId) {
    const res = await db.productVariant.updateMany({
      where: { id: line.variantId, stock: { gte: line.quantity } },
      data: { stock: { decrement: line.quantity } },
    });
    return res.count === 1;
  }
  if (line.productId) {
    const res = await db.product.updateMany({
      where: { id: line.productId, stock: { gte: line.quantity } },
      data: { stock: { decrement: line.quantity } },
    });
    return res.count === 1;
  }
  if (line.sideId) {
    const side = await db.side.findUnique({ where: { id: line.sideId }, select: { stock: true } });
    if (!side) return false;
    if (side.stock === null) return true; // untracked side — nothing to reserve
    const res = await db.side.updateMany({
      where: { id: line.sideId, stock: { gte: line.quantity } },
      data: { stock: { decrement: line.quantity } },
    });
    return res.count === 1;
  }
  return false;
}

// Only ever called by release-checkout-reservation.ts, inside the same
// transaction as the conditional status transition that guarantees it runs
// once per checkout. updateMany so a since-deleted product/variant/side is a
// no-op rather than an error that would block the rest of the release.
export async function releaseLine(db: Db, line: StockLine): Promise<void> {
  if (line.quantity <= 0) return;
  if (line.variantId) {
    await db.productVariant.updateMany({ where: { id: line.variantId }, data: { stock: { increment: line.quantity } } });
  } else if (line.productId) {
    await db.product.updateMany({ where: { id: line.productId }, data: { stock: { increment: line.quantity } } });
  } else if (line.sideId) {
    // Mirrors reserveLine: an untracked (null-stock) side was never decremented.
    await db.side.updateMany({ where: { id: line.sideId, stock: { not: null } }, data: { stock: { increment: line.quantity } } });
  }
}
