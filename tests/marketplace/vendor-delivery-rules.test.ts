// Pure rules of the student-orchestrated Vendor delivery workflow: the strict two-hour order cutoff (school time,
// across midnight), the 24-hour confirmation deadline, and the delivery-code crypto (generation, masking,
// booking-bound verification, encryption). No database.
import "../helpers/env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSlotBookable, minutesUntilSlotStart, schoolTimeToInstant, MIN_ORDER_CUTOFF_MINS } from "@/services/marketplace/vendor-delivery/is-slot-bookable";
import { deliveryConfirmationDeadline } from "@/services/marketplace/vendor-delivery/handover/delivery-deadline";
import {
  decryptDeliveryCode,
  deliveryCodeMatches,
  encryptDeliveryCode,
  generateDeliveryCode,
  hashDeliveryCode,
  issueDeliveryCode,
  maskDeliveryCode,
  normalizeDeliveryCode,
} from "@/lib/delivery-code";

// A real instant for a Lagos (UTC+1, no DST) wall-clock time.
const lagos = (iso: string) => new Date(`${iso}:00+01:00`);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const slot = (windowStart: string, bookingCutoffMins = 0) => ({ windowStart, bookingCutoffMins });

describe("two-hour order cutoff", () => {
  const sevenPm = slot("19:00");
  const date = day("2026-10-20");

  it("closes exactly two hours before the slot starts (start time, not end)", () => {
    assert.equal(MIN_ORDER_CUTOFF_MINS, 120);
    assert.equal(isSlotBookable(sevenPm, lagos("2026-10-20T16:59"), date), true, "4:59 PM: open");
    assert.equal(isSlotBookable(sevenPm, lagos("2026-10-20T17:00"), date), false, "5:00 PM: closed");
    assert.equal(isSlotBookable(sevenPm, lagos("2026-10-20T17:01"), date), false, "5:01 PM: closed");
    assert.equal(isSlotBookable(sevenPm, lagos("2026-10-20T19:30"), date), false, "during the slot: closed");
  });

  it("defaults to today in school time, whatever the server's timezone", () => {
    assert.equal(isSlotBookable(sevenPm, lagos("2026-10-20T16:00")), true);
    assert.equal(isSlotBookable(sevenPm, lagos("2026-10-20T17:30")), false);
  });

  it("applies across midnight: a 12:30 AM slot tomorrow is closed at 11:00 PM tonight", () => {
    const early = slot("00:30");
    assert.equal(minutesUntilSlotStart("00:30", lagos("2026-10-20T23:00"), day("2026-10-21")), 90);
    assert.equal(isSlotBookable(early, lagos("2026-10-20T23:00"), day("2026-10-21")), false);
    assert.equal(isSlotBookable(early, lagos("2026-10-20T22:00"), day("2026-10-21")), true, "2h30 ahead: open");
  });

  it("future dates are open; past dates are closed", () => {
    assert.equal(isSlotBookable(sevenPm, lagos("2026-10-20T18:00"), day("2026-10-22")), true);
    assert.equal(isSlotBookable(sevenPm, lagos("2026-10-20T08:00"), day("2026-10-19")), false);
  });

  it("an admin may set a LONGER cutoff per slot, never a shorter one", () => {
    assert.equal(isSlotBookable(slot("19:00", 30), lagos("2026-10-20T17:30"), date), false, "30 min configured -> still 2 h");
    assert.equal(isSlotBookable(slot("19:00", 180), lagos("2026-10-20T16:30"), date), false, "3 h configured -> 3 h");
    assert.equal(isSlotBookable(slot("19:00", 180), lagos("2026-10-20T15:59"), date), true);
  });

  it("converts school wall-clock times to real instants", () => {
    assert.equal(schoolTimeToInstant(day("2026-10-20"), "17:00").toISOString(), "2026-10-20T16:00:00.000Z");
    assert.equal(schoolTimeToInstant(day("2026-10-21"), "00:30").toISOString(), "2026-10-20T23:30:00.000Z");
  });
});

describe("24-hour delivery confirmation deadline", () => {
  it("is 24 hours after the slot ends, or after a rescheduled retry", () => {
    assert.equal(deliveryConfirmationDeadline(day("2026-10-20"), "18:00").toISOString(), "2026-10-21T17:00:00.000Z");
    const retry = new Date("2026-10-21T18:00:00.000Z");
    assert.equal(deliveryConfirmationDeadline(day("2026-10-20"), "18:00", [null, retry]).toISOString(), "2026-10-22T18:00:00.000Z");
  });
});

describe("delivery code crypto", () => {
  it("six digits, zero-padded, from a uniform CSPRNG", () => {
    const codes = Array.from({ length: 2000 }, generateDeliveryCode);
    assert.ok(codes.every((c) => /^\d{6}$/.test(c)));
    assert.ok(new Set(codes).size > 1990, "no obvious repetition");
    assert.ok(codes.some((c) => c.startsWith("0")), "leading zeroes occur");
  });

  it("hides exactly three randomly chosen positions, varying between codes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const masked = maskDeliveryCode("123456");
      assert.equal(masked.length, 6);
      assert.equal(masked.split("").filter((c) => c === "_").length, 3);
      masked.split("").forEach((c, j) => c === "_" || assert.equal(c, "123456"[j], "visible digits are the real ones in place"));
      seen.add(masked.replace(/\d/g, "x"));
    }
    assert.equal(seen.size, 20, "all C(6,3)=20 patterns occur");
  });

  it("verifies only the full code, only for its own booking", () => {
    const issued = issueDeliveryCode("booking-a");
    assert.ok(deliveryCodeMatches("booking-a", issued.code, issued.codeHash));
    assert.ok(!deliveryCodeMatches("booking-b", issued.code, issued.codeHash), "can't complete another booking");
    const wrong = issued.code === "000000" ? "000001" : "000000";
    assert.ok(!deliveryCodeMatches("booking-a", wrong, issued.codeHash));
    assert.ok(!deliveryCodeMatches("booking-a", issued.maskedCode.replace(/_/g, "0"), issued.codeHash) || issued.maskedCode.replace(/_/g, "0") === issued.code);
    assert.notEqual(issued.codeHash, hashDeliveryCode("booking-a", wrong));
    assert.ok(!issued.codeHash.includes(issued.code) && !issued.codeCipher.includes(issued.code), "never stored in plaintext");
  });

  it("encrypts for the student, bound to the booking", () => {
    const cipher = encryptDeliveryCode("booking-a", "012345");
    assert.equal(decryptDeliveryCode("booking-a", cipher), "012345");
    assert.throws(() => decryptDeliveryCode("booking-b", cipher), "wrong booking can't decrypt");
    assert.notEqual(encryptDeliveryCode("booking-a", "012345"), cipher, "random IV per encryption");
  });

  it("normalizes typed input", () => {
    assert.equal(normalizeDeliveryCode(" 012 345 "), "012345");
    assert.equal(normalizeDeliveryCode("12345"), null);
    assert.equal(normalizeDeliveryCode("12345a"), null);
    assert.equal(normalizeDeliveryCode(123456), null);
  });
});
