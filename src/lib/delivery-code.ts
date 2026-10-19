// src/lib/delivery-code.ts
//
// The student handover code for a Vendor delivery booking: six digits the
// student gives the deliverer at the door. Pure crypto helpers — persistence
// and state live in services/marketplace/vendor-delivery/handover/.
//
//   - generated with crypto.randomInt (never derived from ids, phones, times);
//   - verified via an HMAC bound to the booking id, so a code can never
//     complete a different booking, and compared in constant time;
//   - kept for the student as AES-256-GCM ciphertext (server key, booking id as
//     associated data), never as reusable plaintext;
//   - shown to deliverers and admins only as a mask with three randomly chosen
//     positions hidden ("1_3_5_"). The mask is a visual aid, never a secret.
//
// Keys are derived (HKDF) from DELIVERY_CODE_SECRET, falling back to
// NEXTAUTH_SECRET. Rotating that secret invalidates every outstanding code
// (admins can reissue one from the delivery operations page).

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "crypto";

export const DELIVERY_CODE_LENGTH = 6;
export const HIDDEN_DIGITS = 3;
// Wrong submissions allowed against one code before it locks (an admin must
// reissue it). With three digits visible to the deliverer there are 1,000
// candidates, so this caps a guessing deliverer at a 0.5% chance.
export const MAX_DELIVERY_CODE_ATTEMPTS = 5;

function baseSecret(): string {
  const secret = process.env.DELIVERY_CODE_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("DELIVERY_CODE_SECRET (or NEXTAUTH_SECRET) must be set to issue delivery codes.");
  return secret;
}

function key(purpose: "mac" | "enc"): Buffer {
  return Buffer.from(hkdfSync("sha256", baseSecret(), "akadverse-marketplace", `delivery-code:${purpose}`, 32));
}

export function generateDeliveryCode(): string {
  return String(randomInt(0, 10 ** DELIVERY_CODE_LENGTH)).padStart(DELIVERY_CODE_LENGTH, "0");
}

// Three distinct positions chosen uniformly (partial Fisher-Yates with a CSPRNG).
export function maskDeliveryCode(code: string): string {
  const positions = Array.from({ length: code.length }, (_, i) => i);
  for (let i = 0; i < HIDDEN_DIGITS; i++) {
    const j = i + randomInt(0, positions.length - i);
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const hidden = new Set(positions.slice(0, HIDDEN_DIGITS));
  return Array.from(code, (digit, i) => (hidden.has(i) ? "_" : digit)).join("");
}

export function hashDeliveryCode(bookingId: string, code: string): string {
  return createHmac("sha256", key("mac")).update(`${bookingId}:${code}`).digest("hex");
}

export function normalizeDeliveryCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/\s+/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function deliveryCodeMatches(bookingId: string, supplied: string, storedHash: string): boolean {
  const a = Buffer.from(hashDeliveryCode(bookingId, supplied), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function encryptDeliveryCode(bookingId: string, code: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("enc"), iv);
  cipher.setAAD(Buffer.from(bookingId));
  const body = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptDeliveryCode(bookingId: string, payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key("enc"), raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(bookingId));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

// Everything to persist for a freshly issued code. The plaintext is returned
// only so the caller can send it to the student once; never store or log it.
export function issueDeliveryCode(bookingId: string) {
  const code = generateDeliveryCode();
  return { code, codeHash: hashDeliveryCode(bookingId, code), codeCipher: encryptDeliveryCode(bookingId, code), maskedCode: maskDeliveryCode(code) };
}
