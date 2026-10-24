// services/marketplace/notifications/email.service.ts
//
// Transactional email for the Marketplace, via Resend. Every Marketplace
// notification email (new order, ready-for-pickup, delivery OTP, payout,
// etc — see docs/marketplace/systems/email-system.md) goes through
// sendEmail() below rather than calling the Resend SDK directly, so there's
// one place that knows how to fail safely (a broken email send must never
// take down the order/delivery/payout action it was triggered by) and one
// place to swap providers later.

import { Resend } from "resend";

const FROM_ADDRESS = process.env.MARKETPLACE_EMAIL_FROM ?? "AkadVerse Marketplace <marketplace@akadverse.app>";

let resendClient: Resend | null = null;
function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

// Where admin-facing emails (new business registration, verification
// request, deliverer application) go — never hardcoded, see .env.example.
// Returns null (rather than throwing) when unset, same "log and skip"
// posture as sendEmail() itself having no RESEND_API_KEY — a missing admin
// inbox must never break the action that triggered the notification.
export function getAdminEmail(): string | null {
  const email = process.env.ADMIN_EMAIL?.trim();
  if (!email) {
    console.warn("[email] ADMIN_EMAIL is not configured — admin notification emails will be skipped.");
    return null;
  }
  return email;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  // A stable, unique-per-template identifier (see each template function
  // below) — logged alongside every send outcome so a specific
  // notification type can be grepped for in the logs even though the
  // subject line is sometimes dynamic (e.g. newOrderEmail's order id) and
  // several templates otherwise share very similar subjects (the two
  // "Delivery failed" emails, the two payout emails, etc).
  type: string;
}

// Deliberately swallows send failures (after logging) rather than
// propagating them — an email provider outage must never fail the order
// state change, payout, or cron run that triggered the notification. Every
// call site in this codebase should be a fire-and-forget `void sendEmail(...)`
// or an awaited-but-ignored-on-failure call for exactly this reason.
export async function sendEmail(input: SendEmailInput): Promise<void> {
  await sendEmailWithResult(input);
}

export type SendEmailResult = { ok: true; providerMessageId: string | null } | { ok: false; error: string };

// Same as sendEmail (never throws, logs the outcome) but reports whether
// Resend ACCEPTED the message, for the outbox (email-outbox.ts) to record
// and retry. Acceptance is not inbox delivery — bounces/spam filtering
// happen later and are only visible in the Resend dashboard.
export async function sendEmailWithResult({ to, subject, html, type }: SendEmailInput): Promise<SendEmailResult> {
  const client = getClient();
  if (!client) {
    // No RESEND_API_KEY configured (e.g. local dev without the env var
    // set) — log instead of silently doing nothing, so a missing key is
    // obvious in the logs rather than looking like a delivered email.
    console.warn(`[email] RESEND_API_KEY not set — would have sent "${type}" ("${subject}") to ${to}`);
    return { ok: false, error: "RESEND_API_KEY is not configured." };
  }

  try {
    const result = await client.emails.send({ from: FROM_ADDRESS, to, subject, html });
    if (result.error) {
      console.error(`[email] Resend rejected "${type}" ("${subject}") to ${to}:`, result.error);
      return { ok: false, error: `${result.error.name ?? "error"}: ${result.error.message ?? "rejected by provider"}` };
    }
    console.log(`[email] sent "${type}" ("${subject}") to ${to}${result.data?.id ? ` (id: ${result.data.id})` : ""}`);
    return { ok: true, providerMessageId: result.data?.id ?? null };
  } catch (err) {
    console.error(`[email] failed to send "${type}" ("${subject}") to ${to}:`, err);
    return { ok: false, error: err instanceof Error ? err.message : "Unknown email provider error." };
  }
}

// Every value interpolated into a template that a user typed (business
// names, reasons, product names) goes through this — the templates are HTML.
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Absolute links in emails. NEXTAUTH_URL is already required for auth and is
// the app's public origin; APP_BASE_URL can override it if they ever differ.
export function appUrl(path: string): string {
  const base = (process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "").trim().replace(/\/+$/, "");
  return base ? `${base}${path}` : path;
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, Helvetica, Arial, sans-serif; background:#f6f7f9; margin:0; padding:24px;">
    <div style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:12px; padding:32px; border:1px solid #eaeaea;">
      <h1 style="font-size:18px; margin:0 0 16px;">${title}</h1>
      ${bodyHtml}
      <p style="margin-top:32px; font-size:12px; color:#888;">AkadVerse Marketplace</p>
    </div>
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// Templates — one function per notification the spec requires. Each is a
// thin wrapper around layout() so every email shares the same look; the
// actual sendEmail() call is left to the caller (the route/cron that has
// the recipient address), keeping these pure "build the content" functions.
// ---------------------------------------------------------------------------

// Sent to the business/vendor owner once, after payment is verified and the
// order finalized (services/marketplace/checkout/notify-order-paid.ts, via
// the email outbox). Deliberately carries no buyer contact details or
// address: a Business seller hands off at the central drop-off and a vendor
// hands off to a deliverer, so neither needs them to fulfil the order.
export function newOrderEmail(params: {
  businessName: string;
  orderId: string;
  paymentReference: string;
  items: { name: string; variantName?: string | null; quantity: number; lineTotal: number }[];
  totalAmount: number;
  currency: string;
  deliveryInfo: string | null;
  nextStep: string;
  orderUrl: string;
}) {
  const money = (amount: number) => `${params.currency === "NGN" ? "₦" : `${params.currency} `}${amount.toLocaleString("en-NG")}`;
  const rows = params.items
    .map(
      (item) =>
        `<tr><td style="padding:4px 0;">${item.quantity} × ${escapeHtml(item.name)}${item.variantName ? ` <span style="color:#666;">(${escapeHtml(item.variantName)})</span>` : ""}</td><td style="padding:4px 0; text-align:right;">${money(item.lineTotal)}</td></tr>`
    )
    .join("");
  return {
    type: "new_order",
    subject: `New paid order on ${params.businessName} — #${params.orderId.slice(0, 8)}`,
    html: layout("New paid order", `
      <p>You have a new <strong>paid</strong> order on <strong>${escapeHtml(params.businessName)}</strong>.</p>
      <p style="margin:0;"><strong>Order:</strong> #${params.orderId.slice(0, 8)} <span style="color:#666;">(${params.orderId})</span></p>
      <p style="margin:4px 0 16px;"><strong>Payment reference:</strong> ${escapeHtml(params.paymentReference)}</p>
      <table style="width:100%; border-collapse:collapse; font-size:14px;">${rows}
        <tr><td style="padding-top:8px; border-top:1px solid #eee;"><strong>Total</strong></td><td style="padding-top:8px; border-top:1px solid #eee; text-align:right;"><strong>${money(params.totalAmount)}</strong></td></tr>
      </table>
      ${params.deliveryInfo ? `<p><strong>Delivery:</strong> ${escapeHtml(params.deliveryInfo)}</p>` : ""}
      <p>${escapeHtml(params.nextStep)}</p>
      <p><a href="${params.orderUrl}" style="display:inline-block; background:#2563eb; color:#fff; padding:10px 16px; border-radius:8px; text-decoration:none;">Open your orders</a></p>
    `),
  };
}

export function sellerOrderProcessingEmail(params: { businessName: string; orderId: string }) {
  return {
    type: "seller_order_processing",
    subject: "Your order is being processed",
    html: layout("Order accepted", `
      <p>Your order at <strong>${params.businessName}</strong> has been accepted and is now being processed.</p>
      <p><strong>Order:</strong> ${params.orderId}</p>
    `),
  };
}

export function sellerRejectedEmail(params: { businessName: string; orderId: string; reason: string }) {
  return {
    type: "seller_rejected",
    subject: "Your order was not accepted",
    html: layout("Order rejected", `
      <p><strong>${params.businessName}</strong> was unable to fulfill this order.</p>
      <p><strong>Order:</strong> ${params.orderId}</p>
      <p><strong>Reason:</strong> ${params.reason}</p>
      <p>A refund is being processed for this item.</p>
    `),
  };
}

export function buyerOrderReadyEmail(params: {
  businessName: string;
  orderId: string;
  estimatedDeliveryDate: string;
  deliveryWindow: string;
}) {
  return {
    type: "buyer_order_ready",
    subject: "Your order is ready to be shipped",
    html: layout("Order ready", `
      <p>Your order from <strong>${params.businessName}</strong> is ready and on its way to our delivery network.</p>
      <p><strong>Order:</strong> ${params.orderId}</p>
      <p><strong>Estimated delivery:</strong> ${params.estimatedDeliveryDate}</p>
      <p><strong>Delivery window:</strong> ${params.deliveryWindow}</p>
    `),
  };
}

export function buyerOutForDeliveryEmail(params: { orderId: string }) {
  return {
    type: "buyer_out_for_delivery",
    subject: "Your order is on its way",
    html: layout("On its way", `
      <p>Your order is on its way.</p>
      <p><strong>Order:</strong> ${params.orderId}</p>
    `),
  };
}

export function buyerDeliveryOtpEmail(params: { orderId: string; otp: string; expiresAt: string }) {
  return {
    type: "buyer_delivery_otp",
    subject: "Your delivery confirmation code",
    html: layout("Delivery code", `
      <p>Your delivery confirmation code is:</p>
      <p style="font-size:28px; font-weight:700; letter-spacing:4px;">${params.otp}</p>
      <p><strong>Only share this code after you have received and checked your order.</strong></p>
      <p><strong>Order:</strong> ${params.orderId}</p>
      <p>This code expires at <strong>${params.expiresAt}</strong>.</p>
    `),
  };
}

// Vendor Market: the student's handover code for one delivery booking, sent
// once after payment is verified (services/marketplace/vendor-delivery/
// handover/handover-code.ts). Sent directly, never through the outbox, so the
// code is not persisted in EmailDelivery; the subject carries no digits.
export function studentVendorDeliveryCodeEmail(params: { code: string; deliveryDate: string; slotLabel: string; reissued?: boolean }) {
  return {
    type: "student_vendor_delivery_code",
    subject: params.reissued ? "Your new delivery code" : "Your order is confirmed — delivery code inside",
    html: layout(params.reissued ? "Your new delivery code" : "Order confirmed", `
      <p>Your Vendor Market order will be delivered on <strong>${escapeHtml(params.deliveryDate)}</strong>, <strong>${escapeHtml(params.slotLabel)}</strong>.</p>
      <p>Your delivery code is:</p>
      <p style="font-size:28px; font-weight:700; letter-spacing:4px;">${escapeHtml(params.code)}</p>
      <p><strong>Only give this code to the deliverer after you have received and checked your order.</strong> The deliverer can see only part of it and needs all six digits from you.</p>
      ${params.reissued ? "<p>Any earlier code for this delivery no longer works.</p>" : ""}
      <p>You can also see it any time in <a href="${appUrl("/orders")}">My Orders</a>.</p>
    `),
  };
}

// Pre-slot briefing for an assigned deliverer (services/marketplace/
// vendor-delivery/slot-briefing.ts). Counts and pickup points only — no
// student contact details or codes; those are in the authenticated manifest.
export function delivererSlotBriefingEmail(params: {
  delivererName: string;
  deliveryDate: string;
  slotLabel: string;
  arriveBy: string;
  meetingPoint: string | null;
  studentDeliveries: number;
  vendorPickups: { name: string; location: string | null }[];
}) {
  const pickups = params.vendorPickups.map((v) => `<li>${escapeHtml(v.name)}${v.location ? ` — ${escapeHtml(v.location)}` : ""}</li>`).join("");
  return {
    type: "deliverer_slot_briefing",
    subject: `Your deliveries for ${params.slotLabel}`,
    html: layout("Upcoming delivery slot", `
      <p>Hi ${escapeHtml(params.delivererName)}, you're assigned to <strong>${escapeHtml(params.deliveryDate)}, ${escapeHtml(params.slotLabel)}</strong>.</p>
      <p><strong>${params.studentDeliveries}</strong> student deliver${params.studentDeliveries === 1 ? "y" : "ies"}, from <strong>${params.vendorPickups.length}</strong> vendor pickup${params.vendorPickups.length === 1 ? "" : "s"}:</p>
      <ul>${pickups}</ul>
      <p>Be at <strong>${escapeHtml(params.meetingPoint ?? "the meeting point")}</strong> by <strong>${escapeHtml(params.arriveBy)}</strong>. Collect each order from its vendor — there's nothing to confirm at the vendor. When you hand an order to the student, enter the six-digit code they give you on your Delivery Dashboard (it's saved on your phone and sent automatically if you're offline). Confirm every delivery by the end of the day.</p>
      <p>Your delivery card — addresses, items and the partial delivery codes — is in your <a href="${appUrl("/deliverer")}">deliverer dashboard</a>.</p>
    `),
  };
}

// Seller -> Coordinator drop-off OTP — see
// services/marketplace/order/initiate-order-dropoff.ts. Sent immediately
// on issuance (not via a reminder cron) since the 30-minute window is too
// short for a cron to reliably beat.
export function sellerDropoffOtpEmail(params: { businessName: string; orderId: string; otp: string; expiresAt: string }) {
  return {
    type: "seller_dropoff_otp",
    subject: "Your drop-off code",
    html: layout("Drop-off code", `
      <p>Show this code to the Delivery Coordinator when you drop off your order from <strong>${params.businessName}</strong>:</p>
      <p style="font-size:28px; font-weight:700; letter-spacing:4px;">${params.otp}</p>
      <p><strong>Order:</strong> ${params.orderId}</p>
      <p>This code expires at <strong>${params.expiresAt}</strong>. If it expires before you reach the drop-off point, request a new one from your Orders tab.</p>
    `),
  };
}

// Coordinator -> Deliverer pickup handoff, deliverer side — see
// services/marketplace/delivery/assign-delivery.ts. Deliberately never
// includes the pickupOtp digits themselves: the deliverer must receive the
// code verbally from the coordinator in person, not read it in-app.
export function delivererPickupAssignedEmail(params: { delivererName: string; businessName: string; deadline: string }) {
  return {
    type: "deliverer_pickup_assigned",
    subject: "New pickup assigned",
    html: layout("New pickup assigned", `
      <p>Hi ${params.delivererName}, you've been assigned to pick up an order from <strong>${params.businessName}</strong>.</p>
      <p>Ask the Delivery Coordinator for your pickup code when you arrive.</p>
      <p>This pickup must be confirmed by <strong>${params.deadline}</strong>.</p>
    `),
  };
}

// Reminder sent by the pickup-deadline-reminder cron as a handoff's
// pickupOtpExpiry approaches — see
// services/marketplace/delivery/send-pickup-deadline-reminders.ts. Same
// no-digits rule as delivererPickupAssignedEmail above.
export function delivererPickupDeadlineReminderEmail(params: { delivererName: string; businessName: string; deadline: string }) {
  return {
    type: "deliverer_pickup_deadline_reminder",
    subject: "Pickup deadline approaching",
    html: layout("Pickup deadline approaching", `
      <p>Hi ${params.delivererName}, your pickup from <strong>${params.businessName}</strong> hasn't been confirmed yet.</p>
      <p>It must be picked up by <strong>${params.deadline}</strong>, or the code will need to be reissued. Contact your Delivery Coordinator.</p>
    `),
  };
}

export function sellerDeliveryFailedEmail(params: { businessName: string; orderId: string }) {
  return {
    type: "seller_delivery_failed",
    subject: "Delivery attempt failed",
    html: layout("Delivery failed", `
      <p>A delivery attempt for your order at <strong>${params.businessName}</strong> was unsuccessful.</p>
      <p><strong>Order:</strong> ${params.orderId}</p>
      <p>This order will be revisited in 24 hours.</p>
    `),
  };
}

export function buyerDeliveryFailedEmail(params: { orderId: string; retryAt: string }) {
  return {
    type: "buyer_delivery_failed",
    subject: "Delivery attempt failed",
    html: layout("Delivery failed", `
      <p>We were unable to deliver your order.</p>
      <p><strong>Order:</strong> ${params.orderId}</p>
      <p>We'll retry delivery around <strong>${params.retryAt}</strong>.</p>
    `),
  };
}

export function buyerRefundEmail(params: { orderId: string; reason: string }) {
  return {
    type: "buyer_refund",
    subject: "Your refund has been initiated",
    html: layout("Refund initiated", `
      <p>A refund has been initiated for part of your order.</p>
      <p><strong>Order:</strong> ${params.orderId}</p>
      <p><strong>Reason:</strong> ${params.reason}</p>
    `),
  };
}

export function sellerLateDeliveryRestrictionEmail(params: { businessName: string; fineAmount: number }) {
  return {
    type: "seller_late_delivery_restriction",
    subject: "Delivery restricted — late-delivery fine due",
    html: layout("Delivery restricted", `
      <p><strong>${params.businessName}</strong> missed the drop-off deadline for an order, and is now restricted from delivery.</p>
      <p><strong>Fine due:</strong> ₦${params.fineAmount.toLocaleString()}</p>
      <p>Pay the fine from your business dashboard to restore delivery access.</p>
    `),
  };
}

export function sellerPayoutSuccessEmail(params: { businessName: string; amount: number; orderId: string }) {
  return {
    type: "seller_payout_success",
    subject: "Payout sent",
    html: layout("Payout sent", `
      <p>₦${params.amount.toLocaleString()} has been sent to <strong>${params.businessName}</strong>'s bank account.</p>
      <p><strong>Order:</strong> ${params.orderId}</p>
    `),
  };
}

export function sellerPayoutFailedEmail(params: { businessName: string; orderId: string }) {
  return {
    type: "seller_payout_failed",
    subject: "Payout failed",
    html: layout("Payout failed", `
      <p>A payout to <strong>${params.businessName}</strong> failed and will be retried.</p>
      <p><strong>Order:</strong> ${params.orderId}</p>
    `),
  };
}

export function delivererDailyScheduleEmail(params: { delivererName: string; entries: { orderId: string; date: string; window: string }[] }) {
  const rows = params.entries.map((e) => `<li>Order ${e.orderId.slice(0, 8)} — ${e.date}, ${e.window}</li>`).join("");
  return {
    type: "deliverer_daily_schedule",
    subject: "Today's confirmed deliveries",
    html: layout("Today's deliveries", `
      <p>Hi ${params.delivererName}, here are today's confirmed deliveries:</p>
      <ul>${rows || "<li>No deliveries confirmed for today.</li>"}</ul>
    `),
  };
}

export function delivererApplicationApprovedEmail(params: { firstName: string }) {
  return {
    type: "deliverer_application_approved",
    subject: "Your deliverer application was approved",
    html: layout("Application approved", `
      <p>Hi ${params.firstName}, your deliverer application has been approved. You now have access to the Delivery Dashboard.</p>
    `),
  };
}

// Deliverer application's student-email verification — see
// services/marketplace/deliverer/request-student-email-otp.ts. Sent to the
// canonical <local>@stu.cu.edu.ng address the backend constructs, never a
// client-supplied full address (spec §34). Verifying this OTP proves
// mailbox access only, not university enrollment or admin approval.
export function studentEmailOtpEmail(params: { otp: string; expiresAt: string }) {
  return {
    type: "student_email_otp",
    subject: "Verify your student email",
    html: layout("Verify your student email", `
      <p>Your verification code for the Deliverer application is:</p>
      <p style="font-size:28px; font-weight:700; letter-spacing:4px;">${params.otp}</p>
      <p>This code expires at <strong>${params.expiresAt}</strong> and can only be used once.</p>
    `),
  };
}

// ---------------------------------------------------------------------------
// Business approval + verification — see
// services/marketplace/business/create-business.ts,
// services/marketplace/admin/approve-business.ts,
// services/marketplace/admin/reject-business.ts,
// services/marketplace/business/request-verification.ts, and
// services/marketplace/admin/verify-business.ts. Admin-facing ones go to
// process.env.ADMIN_EMAIL, never hardcoded.
// ---------------------------------------------------------------------------

export function newBusinessRegistrationEmail(params: { businessName: string; ownerEmail: string; industry: string; businessId: string }) {
  return {
    type: "new_business_registration",
    subject: "New business registration request",
    html: layout("New business registration", `
      <p><strong>Business:</strong> ${params.businessName}</p>
      <p><strong>Owner:</strong> ${params.ownerEmail}</p>
      <p><strong>Category:</strong> ${params.industry}</p>
      <p>Review it from the admin Businesses tab.</p>
      <p style="font-size:12px; color:#888;">Business ID: ${params.businessId}</p>
    `),
  };
}

export function businessApprovedEmail(params: { businessName: string; businessId: string; dashboardUrl?: string }) {
  return {
    type: "business_approved",
    subject: "Your business has been approved",
    html: layout("Business approved", `
      <p><strong>${escapeHtml(params.businessName)}</strong> has been approved and is now live on the marketplace.</p>
      <p>You can now access your dashboard and start listing products.</p>
      ${params.dashboardUrl ? `<p><a href="${params.dashboardUrl}" style="display:inline-block; background:#2563eb; color:#fff; padding:10px 16px; border-radius:8px; text-decoration:none;">Open your dashboard</a></p>` : ""}
    `),
  };
}

// Sent once to the owner's account email when an admin blocks their business
// (services/marketplace/admin/block-business.ts, via the email outbox).
// Carries only the reason the admin entered for the owner — never internal
// admin notes, the admin's identity, or report details. There is no formal
// appeal process, so none is described: the owner is pointed at support.
export function businessBlockedEmail(params: { businessName: string; reason: string; supportContact: string | null }) {
  const support = params.supportContact
    ? /^https?:\/\//i.test(params.supportContact)
      ? `<a href="${escapeHtml(params.supportContact)}">${escapeHtml(params.supportContact)}</a>`
      : `<a href="mailto:${escapeHtml(params.supportContact)}">${escapeHtml(params.supportContact)}</a>`
    : null;
  return {
    type: "business_blocked",
    subject: `Your AkadVerse Marketplace account "${params.businessName}" has been blocked`,
    html: layout("Account blocked", `
      <p>Your Marketplace business account <strong>${escapeHtml(params.businessName)}</strong> has been blocked by an AkadVerse administrator.</p>
      <p><strong>Reason:</strong> ${escapeHtml(params.reason)}</p>
      <p>While it is blocked, your storefront and products are hidden from buyers and you cannot receive new orders. Orders that were already paid for are not affected — please continue to fulfil them. Your products, order history, and payout records are kept.</p>
      <p>${support ? `If you believe this is a mistake or would like clarification, contact support at ${support}.` : "If you believe this is a mistake or would like clarification, please contact AkadVerse support."}</p>
    `),
  };
}

// Sent once to a user when an admin blocks their ACCOUNT (services/marketplace/admin/block-user.ts, via the outbox).
// Carries only the reason the admin entered — no admin identity or internal notes — and points to support; there is
// no formal appeal process, so none is described.
export function accountBlockedEmail(params: { firstName: string; reason: string; supportContact: string | null }) {
  const support = params.supportContact
    ? /^https?:\/\//i.test(params.supportContact)
      ? `<a href="${escapeHtml(params.supportContact)}">${escapeHtml(params.supportContact)}</a>`
      : `<a href="mailto:${escapeHtml(params.supportContact)}">${escapeHtml(params.supportContact)}</a>`
    : null;
  return {
    type: "account_blocked",
    subject: "Your AkadVerse Marketplace account has been blocked",
    html: layout("Account blocked", `
      <p>Hi ${escapeHtml(params.firstName)},</p>
      <p>Your AkadVerse Marketplace account has been blocked by an administrator, and you have been signed out.</p>
      <p><strong>Reason:</strong> ${escapeHtml(params.reason)}</p>
      <p>While it is blocked you can't sign in, buy, or sell. Your account data and order history are kept.</p>
      <p>${support ? `If you believe this is a mistake or would like clarification, contact support at ${support}.` : "If you believe this is a mistake or would like clarification, please contact AkadVerse Marketplace support."}</p>
    `),
  };
}

export function businessRejectedEmail(params: { businessName: string; reason: string }) {
  return {
    type: "business_rejected",
    subject: "Your business registration was not approved",
    html: layout("Business not approved", `
      <p><strong>${params.businessName}</strong> was not approved.</p>
      <p><strong>Reason:</strong> ${params.reason}</p>
    `),
  };
}

export function businessVerificationRequestEmail(params: { businessName: string; completedOrders: number; businessId: string }) {
  return {
    type: "business_verification_request",
    subject: "New business verification request",
    html: layout("New verification request", `
      <p><strong>Business:</strong> ${params.businessName}</p>
      <p><strong>Orders completed:</strong> ${params.completedOrders}</p>
      <p>Review it from the admin Verifications tab.</p>
      <p style="font-size:12px; color:#888;">Business ID: ${params.businessId}</p>
    `),
  };
}

export function businessVerificationApprovedEmail(params: { businessName: string }) {
  return {
    type: "business_verification_approved",
    subject: "Your business is now verified",
    html: layout("Verification approved", `
      <p>Congratulations — <strong>${params.businessName}</strong> is now a verified business on the marketplace.</p>
    `),
  };
}

export function businessVerificationRejectedEmail(params: { businessName: string; reason: string }) {
  return {
    type: "business_verification_rejected",
    subject: "Your verification request was not approved",
    html: layout("Verification not approved", `
      <p>Your verification request for <strong>${params.businessName}</strong> was not approved.</p>
      <p><strong>Reason:</strong> ${params.reason}</p>
    `),
  };
}
