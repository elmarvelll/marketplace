// src/app/api/marketplace/paystack/resolve-account/route.ts
//
// GET ?accountNumber=&bankCode= -> resolves the account holder's name.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { resolveAccount } from "./route.controller";

export async function GET(request: NextRequest) {
  return resolveAccount(request);
}
