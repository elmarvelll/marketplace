// .../deliverer/payout-account/route.ts
//
// GET -> the signed-in deliverer's payout account (number shown as last 4
// digits only); PUT { bankName, bankCode, accountNumber } -> change it, with
// the holder name resolved through Paystack. See
// services/marketplace/deliverer/payout-account.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireDelivererId } from "../shared/require-deliverer";
import { getPayoutAccount, setPayoutAccount, type PayoutAccountInput } from "@/services/marketplace/deliverer/payout-account";

export const dynamic = "force-dynamic";

export async function GET() {
  return runController(async () => {
    const delivererId = await requireDelivererId();
    return NextResponse.json({ account: await getPayoutAccount(delivererId) });
  });
}

export async function PUT(request: NextRequest) {
  return runController(async () => {
    const delivererId = await requireDelivererId();
    const body = await readJsonBody<PayoutAccountInput>(request);
    return NextResponse.json({ account: await setPayoutAccount(delivererId, body) });
  });
}
