// Admin -> Delivery Roster UI, rendered to static markup (no browser): days are columns and slots rows, every cell is
// one labelled button, full / unassigned / exception states are distinguishable, phones get a day-at-a-time layout,
// and the cell editor shows bookings and remaining capacity. Clicking/saving against a running server is covered by
// scripts/verify-roster-ui.ts in a real browser.
import "../helpers/env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import RosterGrid from "@/app/admin/delivery-roster/_components/RosterGrid";
import CellEditor from "@/app/admin/delivery-roster/_components/CellEditor";
import ImpactConfirm from "@/app/admin/delivery-roster/_components/ImpactConfirm";
import type { OccurrenceView, RosterCellView, RosterWeekView } from "@/app/admin/delivery-roster/_components/roster-types";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const david = { id: "d1", name: "David Okafor", status: "APPROVED" };
const sarah = { id: "d2", name: "Sarah Bello", status: "APPROVED" };

function occurrence(over: Partial<OccurrenceView> = {}): OccurrenceView {
  return {
    date: "2026-10-19",
    closed: false,
    limit: 3,
    limitSource: "weekly",
    staff: [david],
    staffSource: "weekly",
    hasException: false,
    note: null,
    paid: 1,
    pending: 0,
    booked: 1,
    remaining: 2,
    status: "partial",
    overCapacity: false,
    ...over,
  };
}

function week(): RosterWeekView {
  const slots = [
    { id: "s1", label: "5:00 PM - 6:00 PM", windowStart: "17:00", windowEnd: "18:00", staffPositions: 2, active: true },
    { id: "s2", label: "6:00 PM - 7:00 PM", windowStart: "18:00", windowEnd: "19:00", staffPositions: 1, active: true },
  ];
  const cells: RosterCellView[] = [];
  for (const slot of slots) {
    for (let w = 1; w <= 7; w++) {
      const base: RosterCellView = { slotId: slot.id, weekday: w, maxDeliveries: 3, effectiveMax: 3, deliverers: [david], upcoming: occurrence() };
      if (slot.id === "s1" && w === 1) cells.push({ ...base, upcoming: occurrence({ booked: 3, paid: 3, remaining: 0, status: "full" }) });
      else if (slot.id === "s1" && w === 2) cells.push({ ...base, deliverers: [], upcoming: occurrence({ staff: [], booked: 0, paid: 0, remaining: 3, status: "available" }) });
      else if (slot.id === "s1" && w === 3) cells.push({ ...base, upcoming: occurrence({ hasException: true, closed: true, limit: 0, limitSource: "closed", status: "closed", note: "Holiday" }) });
      else if (slot.id === "s2" && w === 7) cells.push({ ...base, maxDeliveries: null, effectiveMax: null, deliverers: [sarah], upcoming: occurrence({ limit: null, limitSource: "none", remaining: null, staff: [sarah] }) });
      else cells.push(base);
    }
  }
  return {
    operation: "VENDOR",
    timezone: "Africa/Lagos",
    today: "2026-10-17",
    defaultMaxDeliveries: null,
    slots,
    days: DAYS.map((name, i) => ({ weekday: i + 1, name, date: `2026-10-${String(19 + i).padStart(2, "0")}` })),
    cells,
    deliverers: [david, sarah],
  };
}

const noop = () => {};
const grid = (mobileWeekday = 1) => renderToStaticMarkup(<RosterGrid week={week()} onSelectCell={noop} mobileWeekday={mobileWeekday} onMobileWeekday={noop} />);

describe("weekly roster grid", () => {
  it("days are columns (Monday..Sunday) and time slots are rows", () => {
    const html = grid();
    const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
    const headers = [...table.matchAll(/<th scope="col"[^>]*>(?:<span[^>]*>)?([^<]+)/g)].map((m) => m[1]);
    assert.deepEqual(headers, ["Time slot", ...DAYS]);
    const rows = [...table.matchAll(/<th scope="row"[^>]*><span[^>]*>([^<]+)/g)].map((m) => m[1]);
    assert.deepEqual(rows, ["5:00 PM - 6:00 PM", "6:00 PM - 7:00 PM"]);
    assert.equal((table.match(/<button/g) ?? []).length, 14, "one button per weekday/slot cell");
  });

  it("each cell is a single labelled button naming its day, slot, staff, limit and state", () => {
    const html = grid();
    assert.match(html, /aria-label="Edit Monday 5:00 PM - 6:00 PM: David Okafor, max 3, full"/);
    assert.match(html, /aria-label="Edit Tuesday 5:00 PM - 6:00 PM: unassigned, max 3, available"/);
    assert.match(html, /aria-label="Edit Sunday 6:00 PM - 7:00 PM: Sarah Bello, no limit, partially booked"/);
    assert.match(html, /data-cell="s1:1"/);
  });

  it("full, unassigned, closed/exception and partially booked are visibly distinct, with booked counts", () => {
    const html = grid();
    assert.match(html, /bg-red-50 text-red-700[^"]*">Full</);
    assert.match(html, /Unassigned/);
    assert.match(html, /border-amber-300 bg-amber-50\/40/, "unassigned cells are outlined differently");
    assert.match(html, />Closed</);
    assert.match(html, />Exception</);
    assert.match(html, />Partially booked</);
    assert.match(html, /3\/3 booked/);
    assert.match(html, /No limit/);
  });

  it("phones get a day picker and that day's slots as cards instead of the seven-column table", () => {
    const html = grid(2);
    assert.match(html, /hidden md:block overflow-x-auto/, "the table only shows from tablet width up, scrolling inside its box");
    const mobile = html.slice(html.indexOf('class="md:hidden"'));
    assert.match(mobile, /role="tablist"/);
    assert.match(mobile, /aria-selected="true"[^>]*>Tue</);
    assert.equal((mobile.match(/aria-label="Edit Tuesday/g) ?? []).length, 2, "Tuesday's two slots");
    assert.doesNotMatch(mobile, /aria-label="Edit Monday/);
  });

  it("an operation without slots says how to add one", () => {
    const empty = { ...week(), operation: "MARKETPLACE" as const, slots: [], cells: [] };
    const html = renderToStaticMarkup(<RosterGrid week={empty} onSelectCell={noop} mobileWeekday={1} onMobileWeekday={noop} />);
    assert.match(html, /No active time slots/);
    assert.match(html, /Settings &amp; slots/);
  });
});

describe("cell editor", () => {
  const w = week();
  const editor = (cell: RosterCellView, slotIndex = 0) =>
    renderToStaticMarkup(
      <CellEditor operation="VENDOR" slot={w.slots[slotIndex]} dayName="Monday" cell={cell} defaultMax={null} deliverers={w.deliverers} onClose={noop} onSaved={noop} />
    );

  it("shows the next occurrence's bookings, remaining capacity and a full warning", () => {
    const html = editor(w.cells[0]);
    assert.match(html, /role="dialog"/);
    assert.match(html, /Every Monday · 5:00 PM - 6:00 PM/);
    assert.match(html, /3 booked \(3 paid, 0 awaiting payment\) · 0 remaining of 3/);
    assert.match(html, /This occurrence is full/);
    assert.match(html, /aria-label="Maximum deliveries"[^>]*value="3"/);
  });

  it("offers approved deliverers, ticks the current ones, and states staffing is separate from the limit", () => {
    const html = editor(w.cells[0]);
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
    assert.match(html, /checked=""[^>]*\/><span class="flex-1">David Okafor/);
    assert.match(html, /2 position\(s\) on this slot\. Staffing is separate from the delivery limit/);
  });

  it("can't tick more deliverers than the slot has positions", () => {
    // Slot s2 has 1 position and David already holds it: Sarah's box is disabled.
    const html = editor(w.cells.find((c) => c.slotId === "s2" && c.weekday === 1)!, 1);
    assert.match(html, /disabled=""[^>]*\/><span class="flex-1">Sarah Bello/);
  });
});

describe("impact confirmation", () => {
  it("lists affected deliveries and requires both decisions before confirming", () => {
    const html = renderToStaticMarkup(
      <ImpactConfirm
        impact={{
          overCapacity: [{ slotId: "s1", slotLabel: "5:00 PM - 6:00 PM", date: "2026-10-19", booked: 3, newLimit: 1 }],
          replans: [{ scheduledDeliveryId: "p1", slotLabel: "5:00 PM - 6:00 PM", date: "2026-10-19", plannedDeliverer: "David Okafor" }],
          unchanged: [{ scheduledDeliveryId: "p2", slotLabel: "5:00 PM - 6:00 PM", date: "2026-10-19", plannedDeliverer: "Sarah Bello", reason: "dispatched" }],
        }}
        saving={false}
        onConfirm={noop}
        onCancel={noop}
      />
    );
    assert.match(html, /<strong>3<\/strong> booked, new limit <strong>1<\/strong>/);
    assert.match(html, /planned: David Okafor/);
    assert.match(html, /Re-plan them to the updated roster/);
    assert.match(html, /Keep their current planned deliverer/);
    assert.match(html, /1 other delivery\(ies\).*won&#x27;t be changed/);
    assert.match(html, /disabled=""[^>]*>Confirm and save/, "disabled until decisions are made");
  });
});
