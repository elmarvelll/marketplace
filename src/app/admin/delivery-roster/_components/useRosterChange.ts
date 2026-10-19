// src/app/admin/delivery-roster/_components/useRosterChange.ts
//
// The save flow every roster editor shares: preview the change (writes nothing), and if it would affect deliveries
// already booked, hold it for the admin's explicit decision (ImpactConfirm) before applying. The server enforces the
// same rule — a change that needs a decision is refused without one — so this is guidance, not the safeguard.

"use client";

import { useRef, useState } from "react";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import type { Operation, RosterChange, RosterImpact } from "./roster-types";

export interface ChangeDecision {
  planResolution?: "replan" | "keep";
  acknowledgeOverCapacity?: boolean;
}

export const needsDecision = (impact: RosterImpact) => impact.overCapacity.length > 0 || impact.replans.length > 0;

export function errorMessage(err: unknown, fallback: string): string {
  return (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || fallback;
}

export function useRosterChange(operation: Operation, onSaved: (message: string) => void) {
  const [pending, setPending] = useState<{ change: RosterChange; impact: RosterImpact } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Synchronous double-submit guard (state updates land a render later).
  const busy = useRef(false);

  const apply = async (change: RosterChange, decision: ChangeDecision) => {
    const res = await api.post<{ message: string; replanned: number }>("/marketplace/admin/delivery-roster/changes", { operation, change, ...decision });
    setPending(null);
    onSaved(res.data.replanned > 0 ? `${res.data.message} ${res.data.replanned} planned delivery(ies) re-planned.` : res.data.message);
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the roster. Please try again."));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return {
    saving,
    error,
    pending,
    clearError: () => setError(""),
    submit: (change: RosterChange) =>
      run(async () => {
        const res = await api.post<{ impact: RosterImpact }>("/marketplace/admin/delivery-roster/changes/preview", { operation, change });
        if (needsDecision(res.data.impact)) setPending({ change, impact: res.data.impact });
        else await apply(change, {});
      }),
    confirm: (decision: ChangeDecision) => run(async () => (pending ? apply(pending.change, decision) : undefined)),
    cancel: () => setPending(null),
  };
}
