// services/marketplace/order/record-order-event.ts
//
// The order history system: every meaningful thing that happens to an
// order (or one of its items) gets recorded here, so "who did this and
// when" is always answerable — see
// docs/marketplace/systems/order-history-system.md. Every action that
// changes order/item state calls this as part of the same write, ideally
// the same $transaction, rather than best-effort after the fact.

import type { Prisma, OrderEventType } from "@prisma/client";
import type { Db } from "./shared/db";

export type OrderEventActor = "buyer" | "seller" | "deliverer" | "admin" | "system";

export interface RecordOrderEventInput {
  orderId: string;
  orderItemId?: string;
  type: OrderEventType;
  actorType: OrderEventActor;
  actorId?: string;
  message?: string;
  metadata?: Prisma.InputJsonValue;
}

export async function recordOrderEvent(db: Db, input: RecordOrderEventInput) {
  return db.orderEvent.create({
    data: {
      orderId: input.orderId,
      orderItemId: input.orderItemId,
      type: input.type,
      actorType: input.actorType,
      actorId: input.actorId,
      message: input.message,
      metadata: input.metadata,
    },
  });
}
