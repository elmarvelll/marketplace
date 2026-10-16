// src/app/api/marketplace/paystack/banks/route.controller.ts
//
// Controller for GET /api/marketplace/paystack/banks. See
// services/marketplace/payment/list-banks.ts.

import { NextResponse } from "next/server";
import { runController, requireSession } from "@/lib/controller-helpers";
import { listBanks as listBanksAction } from "@/services/marketplace/payment/list-banks";

export async function getBanks(): Promise<NextResponse> {
  return runController(async () => {
    // Checked here as well as by the route gate: only this re-reads the account, so a blocked or signed-out-everywhere
    // session is refused (the gate can only see that a token exists).
    await requireSession();
    const banks = await listBanksAction();
    return NextResponse.json({ banks });
  });
}
