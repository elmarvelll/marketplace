// services/marketplace/payment/list-banks.ts
//
// The list of NGN banks from Paystack, for the business onboarding/edit
// form's bank-name dropdown. Called by
// src/app/api/marketplace/paystack/banks/route.controller.ts.

import { listBanks as fetchBanks, type PaystackBank } from "@/lib/external/paystack";
import { badGateway } from "@/lib/service-error";

export async function listBanks(): Promise<PaystackBank[]> {
  try {
    return await fetchBanks();
  } catch {
    throw badGateway("Couldn't load the bank list. Please try again.");
  }
}
