// src/app/vendor-dashboard/_components/DeliveryScheduleSection.tsx
//
// The vendor's delivery SCHEDULE: which days of the week it delivers
// (recurring), plus date-by-date exceptions — close one date, or open an
// extra one — and, for each upcoming date, how much of its capacity is
// already taken (paid orders vs. checkouts still awaiting payment).
//
// Per-timeframe order capacity itself is edited in the "Set Product
// Deliveries Per Time Range" section below this one (default, or for one
// date). Everything here is enforced on the server at checkout
// (services/marketplace/vendor/capacity/*); this component only edits and
// displays it. Existing orders are never moved by a change made here.

"use client";

import { useCallback, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { AlertTriangle, CalendarOff, CalendarPlus, CheckCircle2, Loader2, RotateCcw, Save } from "lucide-react";
import api from "@/lib/axios";

type Weekday = "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY";
const WEEK: { key: Weekday; short: string; long: string }[] = [
  { key: "MONDAY", short: "Mon", long: "Monday" },
  { key: "TUESDAY", short: "Tue", long: "Tuesday" },
  { key: "WEDNESDAY", short: "Wed", long: "Wednesday" },
  { key: "THURSDAY", short: "Thu", long: "Thursday" },
  { key: "FRIDAY", short: "Fri", long: "Friday" },
  { key: "SATURDAY", short: "Sat", long: "Saturday" },
  { key: "SUNDAY", short: "Sun", long: "Sunday" },
];

interface ScheduleDay {
  date: string;
  weekday: Weekday;
  available: boolean;
  source: "every_day" | "recurring" | "override";
  note: string | null;
  hasCapacityOverride: boolean;
  slots: { slotId: string; slotLabel: string; capacity: number; paid: number; reserved: number }[];
  overCapacity: boolean;
}

interface Schedule {
  weekdays: Weekday[];
  upcoming: ScheduleDay[];
  overrides: { date: string; available: boolean; note: string | null }[];
  maxConfigDays: number;
}

const dayFormatter = new Intl.DateTimeFormat("en-NG", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const formatDate = (iso: string) => dayFormatter.format(new Date(`${iso}T00:00:00Z`));
const errorMessage = (err: unknown, fallback: string) => (isAxiosError<{ error?: string }>(err) && err.response?.data?.error) || fallback;

export default function DeliveryScheduleSection({ businessId, onChanged }: { businessId: string; onChanged?: () => void }) {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const [weekdayDraft, setWeekdayDraft] = useState<Weekday[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // "weekdays" | a date | "new"
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newAvailable, setNewAvailable] = useState<"closed" | "open">("closed");
  const [newNote, setNewNote] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get<Schedule>(`/marketplace/vendor/${businessId}/schedule`);
      setSchedule(res.data);
      setWeekdayDraft(res.data.weekdays);
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
  }, [businessId]);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, [load]);

  // One mutation at a time; every action reloads the authoritative state.
  const run = async (key: string, action: () => Promise<unknown>, fallback: string) => {
    if (busy) return;
    setBusy(key);
    setError("");
    try {
      await action();
      await load();
      onChanged?.();
      return true;
    } catch (err) {
      setError(errorMessage(err, fallback));
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={22} className="animate-spin text-gray-500" />
      </div>
    );
  }
  if (loadState === "error" || !schedule) {
    return <p className="text-sm text-gray-500 py-4">Couldn&apos;t load your delivery schedule.</p>;
  }

  const weekdaysDirty = weekdayDraft.length !== schedule.weekdays.length || weekdayDraft.some((d) => !schedule.weekdays.includes(d));
  const toggleWeekday = (day: Weekday) => setWeekdayDraft((draft) => (draft.includes(day) ? draft.filter((d) => d !== day) : [...draft, day]));
  const saveWeekdays = async () => {
    const ok = await run("weekdays", () => api.put(`/marketplace/vendor/${businessId}/schedule`, { weekdays: weekdayDraft }), "Couldn't save delivery days.");
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };
  const setDate = (date: string, available: boolean, note?: string) =>
    run(date, () => api.put(`/marketplace/vendor/${businessId}/schedule/dates`, { date, available, note }), "Couldn't update that date.");
  const resetDate = (date: string) =>
    run(date, () => api.delete(`/marketplace/vendor/${businessId}/schedule/dates`, { params: { date } }), "Couldn't reset that date.");

  const today = new Date();
  const maxDate = new Date(today.getTime() + schedule.maxConfigDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const laterOverrides = schedule.overrides.filter((o) => !schedule.upcoming.some((d) => d.date === o.date));

  return (
    <div className="space-y-6">
      <div>
        <p id="delivery-weekdays-label" className="text-sm font-medium text-gray-900 mb-1">Recurring delivery days</p>
        <p className="text-xs text-gray-500 mb-3">
          Customers can only book delivery on the days you select. {weekdayDraft.length === 0 && <strong>None selected — you currently deliver every day.</strong>}
        </p>
        <div role="group" aria-labelledby="delivery-weekdays-label" className="flex flex-wrap gap-2">
          {WEEK.map((day) => {
            const on = weekdayDraft.includes(day.key);
            return (
              <button
                key={day.key}
                type="button"
                aria-pressed={on}
                aria-label={day.long}
                disabled={busy !== null}
                onClick={() => toggleWeekday(day.key)}
                className={`w-14 py-2 rounded-xl text-sm font-medium border transition disabled:opacity-50 ${
                  on ? "bg-purple-600 border-purple-600 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {day.short}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={!weekdaysDirty || busy !== null}
          onClick={saveWeekdays}
          className={`mt-3 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
            saved ? "bg-green-50 text-green-700" : "bg-purple-600 hover:bg-purple-700 text-white"
          }`}
        >
          {busy === "weekdays" ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
          {busy === "weekdays" ? "Saving…" : saved ? "Saved" : "Save delivery days"}
        </button>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-900 mb-1">Next {schedule.upcoming.length} days</p>
        <p className="text-xs text-gray-500 mb-3">What customers can book right now, and what is already using each day&apos;s capacity.</p>
        <ul className="space-y-2">
          {schedule.upcoming.map((day) => {
            const capacity = day.slots.reduce((sum, s) => sum + s.capacity, 0);
            const paid = day.slots.reduce((sum, s) => sum + s.paid, 0);
            const reserved = day.slots.reduce((sum, s) => sum + s.reserved, 0);
            return (
              <li key={day.date} className={`rounded-xl border p-3 ${day.available ? "border-gray-100 bg-gray-50" : "border-gray-200 bg-white"}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-[9rem] flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {formatDate(day.date)}{" "}
                      <span className={`ml-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${day.available ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {day.available ? "Delivering" : "No delivery"}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {day.source === "override" ? (day.available ? "Custom delivery date" : "Closed for this date") : day.source === "recurring" ? "Weekly schedule" : "Every day"}
                      {day.note && ` · ${day.note}`}
                      {day.hasCapacityOverride && " · custom capacity"}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {paid} paid{reserved > 0 && ` · ${reserved} awaiting payment`} · capacity {capacity}
                    </p>
                    {day.slots.some((s) => s.paid + s.reserved > 0) && (
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {day.slots
                          .filter((s) => s.paid + s.reserved > 0 || s.capacity > 0)
                          .map((s) => `${s.slotLabel}: ${s.paid + s.reserved}/${s.capacity}`)
                          .join("  ·  ")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {day.available ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => setDate(day.date, false)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {busy === day.date ? <Loader2 size={12} className="animate-spin" /> : <CalendarOff size={12} />} Close this date
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => setDate(day.date, true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {busy === day.date ? <Loader2 size={12} className="animate-spin" /> : <CalendarPlus size={12} />} Deliver this date
                      </button>
                    )}
                    {day.source === "override" && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => resetDate(day.date)}
                        aria-label={`Reset ${formatDate(day.date)} to the weekly schedule`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <RotateCcw size={12} /> Reset
                      </button>
                    )}
                  </div>
                </div>
                {day.overCapacity && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                    <AlertTriangle size={13} className="mt-px shrink-0" />
                    This date already has more orders than it now allows. Those orders are kept and still need to be fulfilled — only new bookings are stopped.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-900 mb-1">Plan a date further ahead</p>
        <p className="text-xs text-gray-500 mb-3">Close a specific date (e.g. a holiday) or add a one-off delivery date, without changing your weekly schedule.</p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newDate) return;
            const ok = await run("new", () => api.put(`/marketplace/vendor/${businessId}/schedule/dates`, { date: newDate, available: newAvailable === "open", note: newNote }), "Couldn't save that date.");
            if (ok) {
              setNewDate("");
              setNewNote("");
            }
          }}
        >
          <label className="text-xs text-gray-600">
            Date
            <input type="date" required value={newDate} min={today.toISOString().slice(0, 10)} max={maxDate} onChange={(e) => setNewDate(e.target.value)} disabled={busy !== null} className="mt-1 block px-3 py-2 border border-gray-400 bg-white text-gray-900 rounded-xl text-sm" />
          </label>
          <label className="text-xs text-gray-600">
            Status
            <select value={newAvailable} onChange={(e) => setNewAvailable(e.target.value as "closed" | "open")} disabled={busy !== null} className="mt-1 block px-3 py-2 border border-gray-400 bg-white text-gray-900 rounded-xl text-sm bg-white">
              <option value="closed">No delivery</option>
              <option value="open">Delivering (custom date)</option>
            </select>
          </label>
          <label className="text-xs text-gray-600 flex-1 min-w-[10rem]">
            Note (optional)
            <input type="text" maxLength={200} value={newNote} onChange={(e) => setNewNote(e.target.value)} disabled={busy !== null} placeholder="e.g. Public holiday" className="mt-1 block w-full px-3 py-2 border border-gray-400 bg-white text-gray-900 rounded-xl text-sm" />
          </label>
          <button type="submit" disabled={!newDate || busy !== null} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50">
            {busy === "new" && <Loader2 size={14} className="animate-spin" />} Save date
          </button>
        </form>

        {laterOverrides.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {laterOverrides.map((o) => (
              <li key={o.date} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-800">
                  {formatDate(o.date)} — <span className="font-medium">{o.available ? "Delivering (custom date)" : "No delivery"}</span>
                  {o.note && <span className="text-gray-500"> · {o.note}</span>}
                </span>
                <button type="button" disabled={busy !== null} onClick={() => resetDate(o.date)} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-50">
                  <RotateCcw size={12} /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <div role="alert" className="text-sm p-2.5 rounded-lg text-red-700 bg-red-100">{error}</div>}
    </div>
  );
}
