// src/app/deliverer/_components/offline-code-queue.ts
//
// Offline-tolerant delivery-code submission for the deliverer's phone.
// Offline ENTRY, never offline verification: a queued code only ever becomes
// "delivered" when the server verifies it (POST .../bookings/:id/confirm).
//
//   - Each entry gets a random submissionId once, so re-sending it (after a
//     flaky connection, a reload, two tabs) is idempotent on the server.
//   - Kept in localStorage only until the server settles it (verified,
//     rejected, or refused for good), then deleted. While it waits the card
//     shows "Awaiting synchronization" — never "Delivered".
//   - Entries older than MAX_AGE are discarded unsent so a code doesn't
//     linger on the phone; a week is long past any connection gap, and a
//     correct code sent late still completes the delivery (recorded as late).
//   - clientRecordedAt is sent as audit information only; the end-of-day
//     deadline is judged on the server's receive time, so changing the
//     phone's clock gains nothing (an admin sees both times).
//
// Known limit: localStorage is readable by anything running on this origin
// and by someone holding the unlocked phone, so a code sits there in
// plaintext until synced. It is never written anywhere else (no URLs, no
// logs).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import api from "@/lib/axios";

const STORAGE_KEY = "akd.deliverer.pendingCodes.v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_EVERY_MS = 30_000;

export interface QueuedCode {
  submissionId: string;
  bookingId: string;
  code: string;
  clientRecordedAt: string;
}

export type CodeResult =
  | { outcome: "VERIFIED"; deliveredItems: number; alreadyDelivered: boolean; late?: boolean }
  | { outcome: "REJECTED"; reason: "mismatch" | "locked"; attemptsLeft: number }
  // Legacy: only a replay of a submission stored before late codes completed the delivery.
  | { outcome: "LATE_REVIEW"; deadlineAt: string }
  | { outcome: "ERROR"; message: string };

function read(): QueuedCode[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as QueuedCode[]) : [];
    const cutoff = Date.now() - MAX_AGE_MS;
    return list.filter((e) => e && typeof e.code === "string" && Date.parse(e.clientRecordedAt) > cutoff);
  } catch {
    return [];
  }
}

function write(list: QueuedCode[]) {
  try {
    if (list.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked: the entry lives only in memory for this page.
  }
}

function newSubmissionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

// "settled" = the server gave a final answer; "retry" = keep it queued.
async function send(entry: QueuedCode): Promise<{ kind: "settled"; result: CodeResult } | { kind: "retry" }> {
  try {
    const res = await api.post<CodeResult>(`/marketplace/deliverer/bookings/${entry.bookingId}/confirm`, {
      code: entry.code,
      submissionId: entry.submissionId,
      clientRecordedAt: entry.clientRecordedAt,
    });
    return { kind: "settled", result: res.data };
  } catch (err) {
    if (isAxiosError<{ error?: string }>(err) && err.response) {
      const status = err.response.status;
      if (status === 429 || status >= 500) return { kind: "retry" };
      return { kind: "settled", result: { outcome: "ERROR", message: err.response.data?.error ?? "This code can't be submitted." } };
    }
    return { kind: "retry" }; // no response: offline or timed out
  }
}

export function useOfflineCodeQueue(onSettled: (entry: QueuedCode, result: CodeResult) => void) {
  const [pending, setPending] = useState<QueuedCode[]>([]);
  const flushing = useRef(false);
  const settledRef = useRef(onSettled);
  useEffect(() => {
    settledRef.current = onSettled;
  }, [onSettled]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (const entry of read()) {
        const outcome = await send(entry);
        if (outcome.kind === "retry") continue;
        write(read().filter((e) => e.submissionId !== entry.submissionId));
        settledRef.current(entry, outcome.result);
      }
    } finally {
      setPending(read());
      flushing.current = false;
    }
  }, []);

  useEffect(() => {
    // Locally-defined wrapper — same convention as the rest of the app.
    const run = async () => {
      write(read()); // drop expired entries
      await flush();
    };
    run();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => {
      if (read().length > 0) void flush();
    }, RETRY_EVERY_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [flush]);

  // Submit now if possible; otherwise queue. Resolves with the server's
  // verdict, or "queued" when it couldn't be reached.
  const submit = useCallback(async (bookingId: string, code: string): Promise<CodeResult | "queued"> => {
    const entry: QueuedCode = { submissionId: newSubmissionId(), bookingId, code, clientRecordedAt: new Date().toISOString() };
    write([...read(), entry]);
    const outcome = typeof navigator !== "undefined" && navigator.onLine === false ? ({ kind: "retry" } as const) : await send(entry);
    if (outcome.kind === "retry") {
      setPending(read());
      return "queued";
    }
    write(read().filter((e) => e.submissionId !== entry.submissionId));
    setPending(read());
    return outcome.result;
  }, []);

  return { pending, submit, flush };
}
