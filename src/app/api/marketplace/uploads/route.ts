// src/app/api/marketplace/uploads/route.ts
//
// POST -> uploads an image (multipart/form-data, field name "file") to
// Cloudinary. Authentication is already enforced at the edge by
// src/proxy.ts. Thin route — see ./route.controller.ts.

import { NextRequest } from "next/server";
import { upload } from "./route.controller";

export async function POST(request: NextRequest) {
  return upload(request);
}
