// services/marketplace/order/shared/db.ts
//
// Accepts either the top-level prisma client or a $transaction callback's
// tx client — shared by every order-domain action that needs to
// participate in a caller's existing transaction (record-order-event.ts,
// recompute-order-delivery-outcome.ts, and the many seller-order/delivery
// actions that call them from inside their own $transaction).

import type { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";

export type Db = typeof prisma | Prisma.TransactionClient;
