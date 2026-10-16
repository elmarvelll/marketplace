// src/app/api/marketplace/search/products/route.ts
//
// GET ?q=&categories=id1,id2,id3,id4&limit=N -> product search/browse.
// Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { searchProducts } from "./route.controller";

export async function GET(request: NextRequest) {
  return searchProducts(request);
}
