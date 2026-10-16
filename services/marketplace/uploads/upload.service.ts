// services/marketplace/uploads/upload.service.ts
//
// Image upload (business logo / product image) via Cloudinary. Validation
// lives here so it's consistent regardless of which form triggers it. See
// src/lib/external/cloudinary.ts for the actual API call.

import { uploadImage, type CloudinaryUploadResult } from "@/lib/external/cloudinary";
import { badRequest, badGateway } from "@/lib/service-error";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB

// The image formats accepted, recognised from the file's OWN first bytes — not from the name or the Content-Type the
// browser sends, both of which the uploader controls. (AkadVerse accepts anything declared as image/*, which includes
// SVG — an XML format that can carry script.) The detected type, not the declared one, is what is passed on.
const SIGNATURES: { mime: string; matches: (b: Uint8Array) => boolean }[] = [
  { mime: "image/jpeg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", matches: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v) },
  { mime: "image/gif", matches: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  { mime: "image/webp", matches: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
];

export function detectImageType(bytes: Uint8Array): string | null {
  return SIGNATURES.find((s) => bytes.length >= 12 && s.matches(bytes))?.mime ?? null;
}

export async function uploadMarketplaceImage(file: File): Promise<CloudinaryUploadResult> {
  if (file.size <= 0) throw badRequest("That file is empty.");
  if (file.size > MAX_FILE_BYTES) throw badRequest("Image must be 5MB or smaller.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = detectImageType(buffer);
  if (!mime) throw badRequest("Only JPEG, PNG, WebP or GIF images are supported.");
  const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;

  try {
    return await uploadImage(dataUri);
  } catch (err) {
    console.error("[upload.service] uploadMarketplaceImage failed", {
      fileType: mime,
      fileSize: file.size,
      error: err,
    });
    throw badGateway("Image upload failed. Please try again.");
  }
}
