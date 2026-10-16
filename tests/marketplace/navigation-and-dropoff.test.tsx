// Marketplace navigation shell (navbar overlap regression) and the seller drop-off action panel.
import "../helpers/env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import DropoffActionPanel, { dropoffStage, ordersAwaitingDropoff, type DropoffPoint } from "@/app/business/_components/DropoffActionPanel";
import { BackLink } from "@/app/_components/MarketplacePageShell";
import type { BusinessOrderSummary } from "@/types/order";

const ROOT = join(process.cwd(), "src/app");
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.tsx$/.test(name) ? [full] : [];
  });
}

describe("marketplace navigation under the fixed navbar", () => {
  const files = sourceFiles(ROOT);

  it("no element combines the navbar offset (pt-16) with vertical padding (py-*) — the cause of the hidden back link", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const classes = (match[1] ?? match[2] ?? "").split(/\s+/);
        if (classes.includes("pt-16") && classes.some((c) => /^(?:[a-z0-9]+:)?py-/.test(c))) offenders.push(`${file}: ${match[0].slice(0, 90)}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("the shared shell keeps the offset on <main> and the padding on a separate inner element", () => {
    const shell = readFileSync(join(ROOT, "_components/MarketplacePageShell.tsx"), "utf8");
    assert.match(shell, /<main className="pt-16">/);
    assert.match(shell, /mx-auto px-4 sm:px-6 py-6 sm:py-10/);
  });

  it("every page that shows the fixed navbar and a back control gets both from the shell", () => {
    const expected = ["checkout/page.tsx", "vendor-checkout/page.tsx", "orders/page.tsx", "deliverer/page.tsx", "business/[id]/layout.tsx", "vendor-dashboard/[id]/layout.tsx", "business/create/page.tsx", "vendor/apply/page.tsx", "deliverer/apply/page.tsx"];
    for (const rel of expected) {
      const source = readFileSync(join(ROOT, rel), "utf8");
      assert.match(source, /<MarketplacePageShell /, `${rel} uses the shell`);
    }
    for (const rel of ["explore/page.tsx", "vendor/[id]/page.tsx"]) {
      assert.match(readFileSync(join(ROOT, rel), "utf8"), /<BackLink \/>/, `${rel} has the shared back control`);
    }
    const duplicates = files.filter((f) => !f.endsWith("MarketplacePageShell.tsx") && /<ArrowLeft size=\{16\} \/>\s*Back to Marketplace/.test(readFileSync(f, "utf8")));
    assert.deepEqual(duplicates, [], "no leftover hand-rolled copies of the old faint Back to Marketplace link (in-dashboard \"Back to Products\" links are separate and fine)");
  });

  it("the back control is a real link with a visible label that truncates instead of overflowing", () => {
    const html = renderToStaticMarkup(<BackLink />);
    assert.match(html, /^<a [^>]*href="\/"/);
    assert.match(html, /Back to Marketplace/);
    assert.match(html, /min-h-10/);
    assert.match(html, /max-w-full/);
    assert.match(html, /<span class="truncate">/);
    const long = renderToStaticMarkup(<BackLink label={"Back to ".concat("Very Long Business Name ".repeat(8))} href="/x" />);
    assert.match(long, /truncate/);
  });
});

const baseOrder: BusinessOrderSummary = {
  id: "0a1b2c3d-0000-0000-0000-000000000000",
  status: "ACCEPTED",
  fulfillmentStatus: "READY_FOR_PICKUP",
  section: "ready_for_pickup",
  totalAmount: 5000,
  itemCount: 2,
  createdAt: new Date().toISOString(),
  rejectionReason: null,
  estimatedDeliveryAt: null,
  deliveryWindowStart: null,
  deliveryWindowEnd: null,
  sellerMarkedReadyAt: new Date().toISOString(),
  dropoffOtp: null,
  dropoffOtpExpiry: null,
  sellerDroppedOffAt: null,
  coordinatorReceivedAt: null,
  dropoffDeadline: null,
  missedDropoffDeadline: false,
  items: [],
} as BusinessOrderSummary;
const point: DropoffPoint = { dropoffWindowStart: "17:00", dropoffWindowEnd: "19:00", dropoffLocation: "Room 12, Student Centre", dropoffLocationName: "Central Drop-off", dropoffLocationInstructions: "Ask for the coordinator at the front desk.", dropoffLocationActive: true };
const render = (orders: BusinessOrderSummary[], p: DropoffPoint | null = point, busy: string | null = null) =>
  renderToStaticMarkup(<DropoffActionPanel orders={orders} point={p} busyOrderId={busy} onRequestCode={() => {}} />);

describe("seller drop-off action panel", () => {
  it("only orders that are ready for pickup appear — never earlier or later stages", () => {
    const stages: Partial<BusinessOrderSummary>[] = [
      { status: "PENDING_SELLER", fulfillmentStatus: null },
      { status: "ACCEPTED", fulfillmentStatus: "PROCESSING" },
      { status: "ACCEPTED", fulfillmentStatus: "HANDED_TO_DELIVERER" },
      { status: "REJECTED", fulfillmentStatus: null },
      { status: "CANCELLED", fulfillmentStatus: "READY_FOR_PICKUP" },
    ];
    for (const stage of stages) {
      const order = { ...baseOrder, ...stage } as BusinessOrderSummary;
      assert.equal(ordersAwaitingDropoff([order]).length, 0, JSON.stringify(stage));
      assert.equal(render([order]), "", "panel renders nothing");
    }
    assert.equal(ordersAwaitingDropoff([baseOrder]).length, 1);
  });

  it("derives the stage from the existing drop-off fields", () => {
    const now = new Date();
    assert.equal(dropoffStage(baseOrder, now), "needs_code");
    assert.equal(dropoffStage({ ...baseOrder, dropoffOtp: "123456", dropoffOtpExpiry: new Date(now.getTime() + 60_000).toISOString() }, now), "code_issued");
    assert.equal(dropoffStage({ ...baseOrder, dropoffOtp: "123456", dropoffOtpExpiry: new Date(now.getTime() - 60_000).toISOString() }, now), "code_expired");
    assert.equal(dropoffStage({ ...baseOrder, dropoffOtp: "123456", coordinatorReceivedAt: now.toISOString() }, now), "received");
  });

  it("shows the order reference, pickup point, instructions, status, next step and the action", () => {
    const html = render([baseOrder]);
    for (const text of ["1 order ready to drop off", "Order #0a1b2c3d", "Central Drop-off", "Room 12, Student Centre", "Ask for the coordinator at the front desk.", "17:00–19:00", "Status:", "Next:", "get my code"]) {
      assert.ok(html.includes(text), `missing: ${text}`);
    }
    assert.match(html, /<section aria-labelledby="dropoff-panel-title"/);
  });

  it("shows the code once issued, and no action once the coordinator has received it", () => {
    const issued = render([{ ...baseOrder, dropoffOtp: "123456", dropoffOtpExpiry: new Date(Date.now() + 600_000).toISOString() }]);
    assert.ok(issued.includes("123 456"));
    assert.ok(issued.includes("Get a new code"));
    const received = render([{ ...baseOrder, dropoffOtp: "123456", coordinatorReceivedAt: new Date().toISOString() }]);
    assert.ok(received.includes("Drop-off confirmed"));
    assert.ok(!received.includes("<button"), "no further action is offered");
  });

  it("disables the action while a request for that order is in flight (no duplicate submits)", () => {
    assert.match(render([baseOrder], point, baseOrder.id), /<button[^>]*disabled=""/);
    assert.doesNotMatch(render([baseOrder], point, "another-order"), /<button[^>]*disabled=""/);
  });

  it("says so when the pickup point isn't configured or is inactive, rather than inventing one", () => {
    const missing = render([baseOrder], { dropoffWindowStart: "17:00", dropoffWindowEnd: "19:00", dropoffLocation: null });
    assert.ok(missing.includes("hasn&#x27;t been set yet"));
    assert.ok(render([baseOrder], null).includes("hasn&#x27;t been set yet"));
    assert.ok(render([baseOrder], { ...point, dropoffLocationActive: false }).includes("marked inactive"));
  });
});
