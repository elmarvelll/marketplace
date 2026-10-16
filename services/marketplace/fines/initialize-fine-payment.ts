// services/marketplace/fines/initialize-fine-payment.ts
//
// Starts a Paystack payment for one outstanding late-delivery fine.
// Distinct "AKD-FINE-" reference prefix so the webhook/verify path can be
// certain a reference belongs to a fine payment, not an order checkout.
// Called by
// src/app/api/marketplace/businesses/[id]/fines/[fineId]/initialize/route.controller.ts.

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { notFound, conflict } from "@/lib/service-error";
import { getPaystackPublicKey } from "@/lib/external/paystack";

export async function initializeFinePayment(businessId: string, fineId: string, email: string | undefined) {
  const fine = await prisma.lateDeliveryFine.findFirst({ where: { id: fineId, businessId } });
  if (!fine) throw notFound("Fine not found.");
  if (fine.status === "PAID") throw conflict("This fine has already been paid.");

  const reference = `AKD-FINE-${Date.now()}-${randomUUID().slice(0, 8)}`;
  await prisma.lateDeliveryFine.update({ where: { id: fineId }, data: { paystackReference: reference } });

  // publicKey: the publishable key for the same Paystack mode the server
  // verifies in — see src/lib/external/paystack.ts.
  return { reference, amountKobo: Math.round(fine.amount * 100), email, publicKey: getPaystackPublicKey() };
}
