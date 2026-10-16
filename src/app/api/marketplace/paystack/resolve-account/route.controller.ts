// src/app/api/marketplace/paystack/resolve-account/route.controller.ts
//
// Controller for GET /api/marketplace/paystack/resolve-account. See
// services/marketplace/payment/resolve-account.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, requireSession } from "@/lib/controller-helpers";
import { resolveAccount as resolveAccountAction } from "@/services/marketplace/payment/resolve-account";

export async function resolveAccount(request: NextRequest): Promise<NextResponse> {
  return runController(async () => {
    // Checked here as well as by the route gate: only this re-reads the account, so a blocked or signed-out-everywhere
    // session is refused (the gate can only see that a token exists).
    await requireSession();
    const accountNumber = request.nextUrl.searchParams.get("accountNumber") ?? undefined;
    const bankCode = request.nextUrl.searchParams.get("bankCode") ?? undefined;
    const resolved = await resolveAccountAction(accountNumber, bankCode);
    return NextResponse.json(resolved);
  });
}
