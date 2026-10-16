// src/lib/account-domains.ts
//
// Email normalisation shared by sign-in paths: trimmed, lower-case — the same way AkadVerse stores every email, so
// any casing the person types matches their AkadVerse account.

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}
