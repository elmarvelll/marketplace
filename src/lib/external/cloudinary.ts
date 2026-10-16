// src/lib/external/cloudinary.ts
//
// Server-only Cloudinary integration. Used by
// src/app/api/marketplace/uploads/route.ts to upload a business's profile
// image; the returned { public_id, secure_url } is what gets stored on the
// Prisma `Business` row (see prisma/schema.prisma).
//
// Never import this from a client component — CLOUDINARY_API_SECRET must
// stay server-side.

import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
}

// Uploads a single image (as a data URI or a remote/base64 string
// Cloudinary's SDK accepts) into a folder namespaced per business so
// assets don't collide across the app as more upload call sites get added.
export async function uploadImage(fileData: string, folder = "akadverse/business-profiles"): Promise<CloudinaryUploadResult> {
  try {
    const result = await cloudinary.uploader.upload(fileData, {
      folder,
      resource_type: "image",
    });

    return { public_id: result.public_id, secure_url: result.secure_url };
  } catch (err) {
    console.error("[cloudinary] uploadImage failed", { folder, error: err });
    throw err;
  }
}
