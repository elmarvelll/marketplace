// src/app/api/marketplace/paystack/banks/route.ts
//
// GET -> the list of NGN banks from Paystack. Thin route — see
// ./route.controller.ts.

import { getBanks } from "./route.controller";

export async function GET() {
  return getBanks();
}
