// services/marketplace/deliverer/list-deliverer-applications.ts
//
// Every deliverer application, for the admin approval queue. Called by
// src/app/api/marketplace/admin/deliverers/route.controller.ts.

import { prisma } from "@/lib/prisma";

export async function listDelivererApplications() {
  const rows = await prisma.deliverer.findMany({
    orderBy: { appliedAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      hall: true,
      room: true,
      preferredAvailability: true,
      status: true,
      appliedAt: true,
      approvedAt: true,
      rejectedAt: true,
      rejectionReason: true,
      suspendedAt: true,
      bankName: true,
      accountHolderName: true,
      accountNumber: true,
      bankCode: true,
    },
  });
  // Payout account summary only — never the full account number.
  return rows.map(({ accountNumber, bankCode, ...d }) => ({
    ...d,
    hasPayoutAccount: Boolean(bankCode && accountNumber && d.accountHolderName),
    accountNumberLast4: accountNumber ? accountNumber.slice(-4) : null,
  }));
}
