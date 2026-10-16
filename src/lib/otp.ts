// src/lib/otp.ts
//
// Shared OTP generation/verification helpers, used by all three
// chain-of-custody OTP flows in the Marketplace: the seller->coordinator
// drop-off handoff (Order.dropoffOtp), the coordinator->deliverer pickup
// handoff (Delivery_x_businesses.pickupOtp), and the buyer delivery
// confirmation (OrderItem.deliveryOtp). Kept as one shared module — not
// duplicated per flow — so all three get the same generation strength and
// attempt-limiting behavior. The 30-minute OTP_TTL_MS/buildOtpExpiry()
// below is shared by the drop-off and buyer-delivery flows; the pickup
// flow uses its own longer-lived buildPickupOtpExpiry() instead (see its
// doc comment). See docs/marketplace/security/otp-security.md.

import { randomInt } from "crypto";

// 6 digits, zero-padded — long enough to not be reasonably guessable within
// the attempt limit below, short enough to read aloud/type on a phone.
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// How long an issued OTP stays valid. Undocumented in the spec as an exact
// number — 30 minutes is chosen as a reasonable window for a physical
// handoff/delivery interaction (long enough not to expire mid-handoff,
// short enough that a stale code can't be replayed much later).
export const OTP_TTL_MS = 30 * 60 * 1000;

export function buildOtpExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + OTP_TTL_MS);
}

// Coordinator -> Deliverer pickup OTP only (Delivery_x_businesses.pickupOtp)
// — deliberately NOT on the shared OTP_TTL_MS. A coordinator may hand the
// batch off to a deliverer later the same day, not within 30 minutes of
// assignment, so this stays valid until 11:59:59.999 PM on the order's
// estimated delivery date instead. The seller drop-off OTP and buyer
// delivery OTP are short in-person interactions and keep the 30-minute
// window above.
export function buildPickupOtpExpiry(estimatedDeliveryAt: Date | null, now: Date = new Date()): Date {
  const base = estimatedDeliveryAt ?? now;
  const endOfDay = new Date(base);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
}

export function isOtpExpired(expiry: Date | null, now: Date = new Date()): boolean {
  return !expiry || expiry.getTime() < now.getTime();
}

// After this many wrong attempts against one issued OTP, verification is
// refused even if the correct code is later supplied — the caller must
// have a new OTP reissued. Guards against brute-forcing a 6-digit code.
export const MAX_OTP_ATTEMPTS = 5;

export interface OtpVerifyInput {
  suppliedCode: string;
  storedCode: string | null;
  storedExpiry: Date | null;
  attempts: number;
}

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: "no_otp_issued" | "expired" | "too_many_attempts" | "mismatch" };

// Pure verification logic — callers are responsible for persisting the
// incremented attempt count (win or lose) and, on success, whatever
// state transition the OTP was gating. Kept pure/synchronous so it's
// trivially testable without a database.
export function verifyOtp({ suppliedCode, storedCode, storedExpiry, attempts }: OtpVerifyInput): OtpVerifyResult {
  if (!storedCode) return { ok: false, reason: "no_otp_issued" };
  if (attempts >= MAX_OTP_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };
  if (isOtpExpired(storedExpiry)) return { ok: false, reason: "expired" };
  // Strip ALL whitespace, not just the ends — every screen that displays a
  // code (seller drop-off, coordinator assignment, deliverer assignments)
  // shows it as "123 456" for readability, and that space is exactly what
  // gets copy/pasted or retyped by whoever reads it aloud. A plain
  // .trim() only handles leading/trailing space, so a correctly-typed
  // code with the display's internal space would otherwise mismatch.
  if (suppliedCode.replace(/\s+/g, "") !== storedCode) return { ok: false, reason: "mismatch" };
  return { ok: true };
}
