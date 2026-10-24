// The deliverer's Vendor delivery card (rendered to static markup, no browser): a delivery reads "Processing order"
// with the student-code form straight away — no vendor pickup code, "Start delivery" or check-in gate — and a code
// saved offline is shown as awaiting synchronization, never as delivered.
import "../helpers/env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import DeliveryCards, { deliveryBadge, resultMessage, type ManifestCard, type ManifestDelivery } from "@/app/deliverer/_components/DeliveryCards";

const delivery = (overrides: Partial<ManifestDelivery> = {}): ManifestDelivery => ({
  bookingId: "b1",
  reference: "AB12CD34",
  studentFirstName: "Ada",
  deliveryLocation: "Hall B",
  vendors: [{ name: "Mama's Kitchen", items: [{ name: "Jollof", quantity: 1 }] }],
  status: "PROCESSING_ORDER",
  maskedCode: "1_3_5_",
  codeLocked: false,
  attemptsLeft: 5,
  deadlineAt: "2026-10-20T23:00:00.000Z",
  overdue: false,
  failedAttempts: 0,
  retryDeliveryAt: null,
  pendingLateReview: false,
  confirmation: null,
  ...overrides,
});
const card = (d: ManifestDelivery): ManifestCard => ({
  key: "k",
  date: "2026-10-20",
  slotLabel: "5-6PM",
  arriveBy: "16:30",
  deliverer: { id: "d1", name: "Del Rider", phone: null },
  attendance: { state: "NOT_RECORDED", checkedInAt: null },
  meetingPoint: "SUB",
  pickups: [{ businessId: "v1", name: "Mama's Kitchen", location: "Block A", contact: null, orderRefs: ["abc12345"], itemCount: 1 }],
  deliveries: [d],
});
const render = (d: ManifestDelivery) => renderToStaticMarkup(<DeliveryCards cards={[card(d)]} onChanged={() => {}} />);

describe("deliverer delivery card", () => {
  it("a processing delivery offers the student-code form at once, with no pickup, start or check-in step", () => {
    const html = render(delivery());
    assert.match(html, /Processing order/);
    assert.match(html, /Confirm delivery/);
    assert.match(html, /Couldn&#x27;t deliver/);
    assert.doesNotMatch(html, /Start delivery|pickup code|Enter pickup OTP|checked in at|start your shift|To collect/i);
  });

  it("an overdue delivery still takes the code, and says so", () => {
    const html = render(delivery({ overdue: true }));
    assert.match(html, /Past the end-of-day deadline/);
    assert.match(html, /Confirm delivery/);
  });

  it("a code queued offline reads as awaiting synchronization — never delivered", () => {
    assert.deepEqual(deliveryBadge({ status: "PROCESSING_ORDER" }, true).text, "Awaiting synchronization");
    assert.equal(deliveryBadge({ status: "PROCESSING_ORDER" }, false).text, "Processing order");
    assert.equal(deliveryBadge({ status: "DELIVERED" }, false).text, "Delivered", "only the server's verdict makes it delivered");
  });

  it("delivered shows how it was confirmed; a wrong code says how to correct it", () => {
    const html = render(delivery({ status: "DELIVERED", confirmation: { method: "ADMIN_FALLBACK", at: "2026-10-20T18:00:00.000Z", late: true } }));
    assert.match(html, /Delivered/);
    assert.match(html, /by an admin/);
    assert.match(html, /\(late\)/);
    assert.doesNotMatch(html, /Confirm delivery/);
    assert.match(resultMessage({ outcome: "REJECTED", reason: "mismatch", attemptsLeft: 3 }).text, /check the six digits.*3 attempts left/);
    assert.match(resultMessage({ outcome: "VERIFIED", deliveredItems: 1, alreadyDelivered: false, late: true }).text, /recorded as late/);
  });
});
