# Report — moving the standalone Marketplace onto AkadVerse's live database

Date: 2026-10-15. Repositories: `Marketplace/` (no Git; a backup was taken before any change) and `akadverse/`
(branch `staging`, HEAD `b9e7e15`, 117 pre-existing uncommitted paths).

**Outcome.** The Marketplace now runs on AkadVerse's Supabase database as the restricted role `marketplace_app`,
reading and writing AkadVerse's own rows. Its sessions are its own, and AkadVerse accounts are the only accounts.
Everything was built and tested against a local replica made from AkadVerse's migrations.

**Nothing was changed in production.** No role was created there, no migration was applied, and nothing was
written. Production was only read: catalog queries in a `READ ONLY` transaction, plus one `prisma migrate diff`
introspection. The production steps are prepared and waiting on approval (section 9).

Decisions made with the owner during the work:

1. AkadVerse ships its own pending migrations.
2. Marketplace-only state lives in a separate `marketplace` schema.
3. AkadVerse owns accounts, so there is no Marketplace sign-up or password reset.

## Update (2026-10-16): contrast and visibility pass (every page)

The work was visual only: no behaviour, data or environment changes. I audited every page and component, measuring
contrast in a real browser rather than eyeballing it.

### Root cause found

`globals.css` (inherited from AkadVerse) switched the page text to near-white (`#ededed`) whenever the computer was in
**dark mode**. The Marketplace is a light design, so anything without its own text colour went almost invisible on
the white cards. That included the product modal's **quantity number**, the cart drawer's quantities and about a
dozen vendor-dashboard and admin form fields. The app is now light-only (`color-scheme: light`, so native date/time
pickers and selects also render light), and the dead `.elearning-shell` rules were removed.

### Changes (app-wide, by rule)

| What | Before → after | Count |
|---|---|---|
| Body/helper text `text-gray-400` (2.5:1 on white, fails WCAG) | → `text-gray-500` (4.8:1). Variants like `hover:`/`disabled:` untouched | 236 |
| `text-gray-300` | Text ("No image", avatar placeholders) → `gray-600`; delete/trash buttons → `gray-500`; decorative empty-state icons and the disabled filter option → `gray-400` | 25 |
| Field placeholders | `placeholder-gray-400` → `placeholder-gray-500`, plus a base-layer default for unstyled fields | 23 |
| Text fields, selects, textareas | Border `gray-200` (1.2:1) → **`gray-400`** (2.5:1). Fields that had no text colour now have `text-gray-900 bg-white`. Sign-in fields too | ~90 fields |
| Buttons, chips, pagination, links styled as buttons | Border `gray-200` → `gray-300`; `text-gray-600` → `gray-700` | 38 |
| **Quantity steppers** (product modal, vendor options, sides, cart drawer) | +/− buttons `gray-400` → `gray-800`, with larger hit areas in the drawer; the number now has an explicit `text-gray-900 font-semibold` (it had no colour); the outline `gray-200` → `gray-400`; option rows and variant chips `gray-300` borders with `gray-800` text | 5 steppers, 3 option groups |
| Disabled controls | `disabled:opacity-30` → `opacity-40` (still clearly disabled, but legible) | 10 |
| **Loading skeletons** (Home, Explore, search, vendor page, owner product lists) | Image block `gray-100` → `gray-300`, title/price bars → `gray-400`, secondary bar → `gray-300`, outline `gray-100` → `gray-200`. New gentler pulse `animate-skeleton` (opacity 1 → 0.65, defined in `globals.css`) instead of Tailwind's 1 → 0.5, so they never fade out. Still off under `prefers-reduced-motion` | 4 skeleton types |
| Coloured text | Green/amber status text `-600` → `-700`; red/blue `-500` → `-600` | 21 |
| White-on-colour buttons and badges | `bg-blue/purple/red-500` → `-600` (hover one step darker); gradient buttons (Add to Cart, Vendor Cart and others) `500→600` → `600→700` | 18 solid, 12 gradients |
| Checkboxes | Brand accent colour (`accent-blue-600`) on the two admin checkboxes | 2 |
| Sign-in page dark theme (its own toggle) | "or" divider `#737373` → `#a3a3a3`; field borders `#262626` → `#525252` | 3 |

### Verification

- **New `scripts/verify-contrast.ts`.** It signs in as a buyer, a seller and an admin and opens **27 pages** (sign-in,
  storefront, checkout, applications, every business and vendor dashboard page, every admin page). It also opens the
  product modal. On each page it measures the WCAG contrast of every visible text element (≥4.5:1, or 3:1 for large
  text) and every field's text (≥4.5:1) and border (≥2:1). It does this with the OS in **light and in dark mode**.
  - Before the fixes: 26 failures after the first round (e.g. "No image" 4.39:1, "Create Product" 3.76:1, green
    status text 3.08:1). The original state was far worse; the first run crashed on `oklch()` colours, so it wasn't
    counted.
  - After: **0 low-contrast elements on all 54 page views**. The modal's quantity number measures near-black
    (`lab(8 …)`) in both OS modes.
- Screenshots checked by eye: the modal in OS dark mode, the skeleton grid mid-load, and the create-business form in
  OS dark mode.
- `npm test` 142 passed. `typecheck` and `lint` are clean. The `scripts/verify-ui.ts` and build results are in the
  completion message.

## Update (2026-10-16): storefront UI fixes

The work was UI only. There were no database, schema or environment changes and AkadVerse was not touched. All
browser testing ran against the **local replica**, never the live database.

### What changed

| Area | Files | Behaviour now |
|---|---|---|
| Loading / empty / error states | **new** `src/app/_components/use-load.ts`, **new** `ProductGrid.tsx`; `src/app/page.tsx`, `explore/page.tsx`, `vendor/[id]/page.tsx`, `business/[id]/products/page.tsx`, `vendor-dashboard/[id]/products/page.tsx` | Every product, vendor and business list uses one explicit state: `loading`, `success` (with data, possibly empty) or `error`. "No products…" appears **only** after a successful empty answer. A network error, timeout or 5xx shows "Couldn't load … / Try again", and Try again re-requests. Search results go back to loading whenever the query or filters change; stale answers are ignored. The vendor page tells a 404 ("This vendor isn't available") apart from a connection failure (retry). Before this, Home showed "No products" while loading and on any error |
| Pulsing ash skeletons | `ProductCard.tsx` (`ProductCardSkeleton`), `ProductGrid.tsx` (`ProductGridSkeleton`, `SpotlightSkeleton`) | They use the existing `bg-gray-100`/`gray-200` placeholder colours in the same card shape (square image, title, seller, price) and the same grid, so nothing jumps when cards arrive. Tailwind `motion-safe:animate-pulse` gives a gentle opacity pulse, with no animation under `prefers-reduced-motion` (verified in a browser) |
| Single standalone navbar | `MarketplaceNavbar.tsx` (rewritten); `components/dashboard/student/DashboardNavbar.tsx` (now just renders it); storefront pages | The inherited "AkadVerse Marketplace" bar is gone everywhere: the 10 pages that imported it now get the Marketplace bar, and storefront pages no longer stack two bars. The bar is fixed and 4rem tall, so existing `pt-16` offsets still fit. Admin and Sign out moved into a new account menu, along with Explore and Your Orders on narrow screens |
| Signet icon | `MarketplaceNavbar.tsx` | The "M" letter is replaced by lucide's `ShoppingBag`, the same mark used on the sign-in shell, with no new dependency. It is a home link labelled "Student Marketplace — home". The text label shows only on wide screens |
| Skills hidden | **new** `_components/marketplace-features.ts` (`SKILLS_ENABLED = false`); `page.tsx`, `explore/page.tsx`, `FilterDropdown.tsx`, `MyTradeDropdown.tsx`, `MarketplaceNavbar.tsx`, `search-params.ts`, `admin/page.tsx` | Hidden: Popular Skills (home), the Skills section (Explore), the Products/Skills toggle in Filter (only product categories now), the Skills tab and "Create Skill" in My Trade, the "skills" search placeholder, `side=skills` in search links (a stale `?side=skills` link shows product results), and the admin "Skill Owners" card. The listing-creation forms had no Skills option. Nothing was deleted; one flag turns it all back on |
| Whole card clickable | `ProductCard.tsx` | The card is one `<button>` with an accessible label. Clicking or tapping anywhere, or Enter/Space, opens the existing modal. "Show Details" still appears on hover and on keyboard focus, but it is a label inside the button, so there are no nested controls and a click on it opens the modal exactly once. Long names wrap to two lines |
| Add to cart | `ProductDetailModal.tsx` | While adding, the button shows a spinner and "Adding…", and a synchronous guard plus the disabled button mean one request per press. **On success:** the carts refresh (badge updates), a confirmation alert names the product, and the modal closes. There is no "Added to cart" state any more. **On failure:** the server's message shows, there is no alert, and the modal stays open to retry. The vendor cart behaves the same way. It uses the existing `window.alert` pattern, since there is no toast system. Cart, stock, payment and checkout logic are unchanged |
| Touch-friendly dropdowns | **new** `_components/use-dropdown.ts`; Filter, My Trade, notifications, account menu | Hover still opens them with a mouse. Tap toggles them on touch screens (previously hover-only), and an outside tap or Escape closes them |
| Mobile | navbar, modal, grids, pages above | The phone navbar fits at 320px: search collapses to an icon that opens a search-and-filter row under the bar. The modal is a bottom sheet (≤92% height, scrolls inside, close button pinned) with Escape to close, a retry when the product fails to load, and 32px quantity buttons. Grids use 2→3→4 columns with tighter gaps on phones. Flyouts are positioned for the single bar. Long names, descriptions and filter chips wrap or truncate |
| Types | `src/types/marketplace-browse.ts` | `FeaturedVendor` moved here, shared by Home and Explore |
| Test isolation (found during this work) | `tests/helpers/env.ts` | Tests now pin every database variable to an empty string. Prisma loads `.env` into unset variables, and `.env` now holds live, full-access settings; two tests briefly ran in full-access mode. They never connected to live, because the runtime URL is always forced to local |

### Verification actually run

| Check | Result |
|---|---|
| `npm test` (local replica) | **142 passed, 0 failed**. New: `tests/marketplace/storefront-ui.test.tsx` (10): each grid state, the single-button card, the Skills flag and search links, the single navbar |
| `scripts/verify-ui.ts`, real Chrome against a local-replica server | **46 passed, 0 failed**. Covers: one navbar and the signet; no Skills on Home, Explore, a stale `side=skills` link, Filter or My Trade; skeleton pulses while loading, cards after, empty only on a confirmed empty answer; errors with working retry (Home and search); reduced motion stops the pulse; the card opens the modal from the price area, "Show Details" (once) and Enter; Escape closes it; no nested controls; add-to-cart success (alert, close, badge 0→1, no "Added" state), failure (error, stays open, no alert) and triple click (1 request); touch: tap opens and an outside tap closes dropdowns, the search row and Filter open, a tap opens the modal and the sheet fits; no horizontal overflow and the navbar fits at **320, 375, 430, 768, 1024 and 1440px** on 10 pages (Home, Explore, search, vendor storefront, orders, checkout, vendor checkout, create business, vendor apply, deliverer apply); the modal fits the viewport at every width |
| `npm run typecheck`, `npm run lint` | Pass |
| `npm run build` | Pass. Run in a scratch copy of the project, so the dev server already running on port 3000 wasn't disturbed |

**Not covered:**

- Admin, owner-dashboard and order-detail pages were reviewed only through the overflow check where listed. They
  were not otherwise redesigned.
- Real Cloudinary images: the test data has none, so the "No image" placeholder was what got checked.

### Decisions for you

- **"Best Services" (Coming Soon) is still shown, and the hero says "Buy, sell, and hire".** These are close to
  Skills but weren't named in the request. To hide them too, gate them with the same flag.
- **The confirmation uses `window.alert`.** It is consistent with the app, but it blocks the page until dismissed. A
  small non-blocking toast would need a new component; say if you want one.

## Update (same day): connected to the live database

At the owner's request ("use the exact same DB"), the Marketplace now runs on AkadVerse's live database with
AkadVerse's own login.

1. **AkadVerse's 3 pending migrations were applied to live** with AkadVerse's own CLI: `role_elearning_values`
   (idempotent), `checkout_payments_and_email_outbox` and `vendor_delivery_date_override`. All are additive. Live
   `public` now diffs empty against AkadVerse's schema. AkadVerse's repository is still unchanged.
2. **Schema `marketplace` was created on live** (AccountState, AuthThrottle, MarketplaceInstance = `production`) via
   `npm run db:migrate`. It is additive and outside `public`.
3. **Full-access mode** (`MARKETPLACE_DB_ACCESS=full`) accepts the `postgres` login. Supabase-internal roles are
   still refused. Startup still checks the project ref, AkadVerse's tables and the marker; it skips the privilege
   checks. The migration grants to `marketplace_app` only apply if that role exists.
4. **Payment guard:** `markOrdersPaid` skips orders that AkadVerse's older live webhook already marked paid, so
   there are no duplicate timeline events, emails or notifications.
5. Tests: **132 passed** (local replica). `db:check` and `db:verify` passed against live (`env=production
   access=full`).

Not done: starting the app against live and signing in. Starting a server on live was blocked by this session's
permissions; the owner does it. Sections 2, 5 and 9 below describe the restricted-role path, which is now optional;
using AkadVerse's own login is a deliberate trade-off.

## Update (2026-10-19): student-orchestrated Vendor Market delivery

**Outcome.** Vendor Market delivery is now run centrally. Admins (acting as vendor managers) and the weekly roster
run it, and deliverers confirm each delivery with a six-digit code the student gives them. Vendors only see their
orders. Built and tested on the local replica. **Nothing was applied to production:** the new migration, and the
earlier `20261017120000_delivery_rosters` (which production also still lacks — that is why the live checkout shows
"Couldn't load your checkout"), need `npm run db:migrate` (section 9).

### Old flow → new flow

| Step | Before | Now |
|---|---|---|
| Ordering | Slot closed 90 min (per-slot setting) before start, and only on the same calendar day | Closes **2 hours before the slot starts**, strictly (7–8 PM slot: 4:59 PM open, 5:00 PM closed). It also works across midnight. Admins may set a longer cutoff, never a shorter one |
| After payment | Order auto-accepted; vendor had to tap ✓ Ready (or ✗ to refund) | Same auto-accept. **Vendors have no actions.** Paid items are immediately assignable. The student is emailed a delivery code |
| Assignment | Admin, after the vendor marked ready | **Automatic at T−2h** to the roster's planned deliverer. Anything unplanned is flagged for an admin. Admins can reassign uncollected items |
| Briefing | None | At T−2h, every admin gets a slot summary, and each assigned deliverer gets a briefing. Each is sent once |
| Shift start | None | The deliverer reports to the **meeting point**. An admin checks them in, which moves the shift from **Scheduled** to **In progress** and hands over the card. **Pickups and deliveries are refused until then.** If the slot ends with no check-in, the shift is **Missed** |
| Pickup | Vendor shows pickup code; deliverer enters it | Unchanged (at the vendor's own location), but only once the shift is in progress |
| Delivery | Per item: a new plaintext code emailed when "out for delivery", 30-min expiry | Per **booking**: one code per student delivery, issued at payment. The deliverer sees 3 of its 6 digits and enters all 6. Offline entry is queued on the phone and verified by the server. The code must reach the server within 24 hours of the slot ending |
| Completion | Item DELIVERED → payout-eligible → 24 h dispute window | Unchanged (same function now shared by both flows) |

### The rules, precisely

- **Cutoff** (`is-slot-bookable.ts`). A new order may be placed only while minutes-to-start > max(120, the slot's
  `bookingCutoffMins`). Times are computed in Africa/Lagos. The checkout summary (slots and dates) and the
  Serializable booking transaction both call it. A checkout initialized before the cutoff can still be paid within
  its existing 30-minute hold, because payment confirmation never re-checks the cutoff.
- **Capacity unit.** This is unchanged: one booking per student checkout counts once against the roster limit,
  whatever the number of vendors. Each vendor's own capacity counts its own order.
- **Code** (`src/lib/delivery-code.ts`, table `marketplace.DeliveryHandoverCode`):
  - Six digits from `crypto.randomInt`, one per `VendorDeliveryBooking`, shared by all its vendor orders.
  - Stored as an HMAC bound to the booking id (so it can't complete another booking, and is compared in constant
    time), plus an AES-256-GCM copy so the student can see it in My Orders. It is never stored in plaintext.
  - Keys are derived from `DELIVERY_CODE_SECRET`, falling back to `NEXTAUTH_SECRET`.
  - The mask (3 random positions hidden, fixed per code) is all deliverers and admins ever see: on the card, in
    the API and in print. Emails and notifications to anyone else never contain it. The student's email is sent
    directly, not through the outbox, so the code isn't stored in `EmailDelivery`.
  - 5 wrong attempts lock the code until an admin reissues it. There is also a limit of 10 wrong codes per
    deliverer per 15 minutes.
- **Deadline.** Confirmation must reach the server within 24 h of the slot's end, or of a rescheduled retry. The
  server's receive time decides; the phone's time is kept only for audit. A correct code that arrives late is
  stored as `LATE_REVIEW` and completes nothing. An admin may accept it (only if the code was correct), with a
  reason, or decline it.
- **Offline.** `offline-code-queue.ts` keeps an entry in localStorage with a one-time `submissionId` until the server
  settles it, then deletes it. It is retried on reconnect and every 30 s, and discarded after 48 h. The server is
  idempotent per `submissionId`, and item completion is conditional, so replays repeat nothing. Offline entry is
  not offline verification.
- **Vendors.** Their ready and fail routes and services are deleted. The generic seller actions (accept, reject,
  ready, drop-off, reject item) now refuse School Vendor businesses at the route (`requireOwnedBusinessOnly`).
  Mark-ready and reject-item also refuse them in the service. Refunds go through the existing admin per-item
  refund, now on the operations page.

### Where things live

- **Admin:** *Delivery Operations* tab (`/admin/delivery-operations`). Per day and slot it shows:
  - when orders closed, and whether the briefing went out
  - every booking, with its vendor orders, payment state, deliverer, masked code, deadline and "needs attention"
    flags
  - late confirmations to review
  - each deliverer's printable card, with its shift state (Scheduled, In progress, Delivered or Missed)
  - the **meeting point** setting.

  The actions are:
  - **Checked in — start shift**
  - **Unlock missed shift** (after the slot ends; needs a reason, and still counts as missed)
  - reassign, new code, refund item, and accept or decline a late confirmation.

  All are audited in `AdminActionLog`, with a reason where the action changes a delivery. The weekly roster stays on *Delivery Roster*.
- **Deliverer:** *Vendor delivery cards* on `/deliverer`: shift state and where and when to report, then pickups,
  then deliveries with the mask, Start delivery, code entry, Couldn't deliver and Print. Actions only appear once
  the shift is in progress. It also shows their record for the last 30 days (delivered and missed shifts). The old
  per-item list now shows Business items only.
- **Student:** My Orders shows the delivery date and slot and the full code until it's used.
- **Scheduler:** `GET /api/cron/vendor-slot-briefing` with `Authorization: Bearer $CRON_SECRET`, every 5–10 min, from
  an external scheduler (README "Scheduled jobs"). It runs regardless of `MARKETPLACE_SCHEDULED_JOBS`, because
  AkadVerse has no copy of it. Exactly-once is enforced by `marketplace.SlotBriefingNotice` (claimed before
  sending, released only if the send fails).

### Files

| Area | Files |
|---|---|
| Cutoff | `services/marketplace/vendor-delivery/is-slot-bookable.ts`, `admin/vendor-delivery/manage-vendor-slots.ts`, `src/app/admin/vendor-delivery/page.tsx` (label) |
| Vendors info-only | deleted `vendor/order/mark-vendor-order-{ready,failed}.ts` and their routes; `delivery/shared/ready-item-filter.ts`; `order/mark-order-ready.ts`, `order/reject-order-item.ts`; five `businesses/[id]/orders/**/route.controller.ts`; `vendor/order/list-vendor-orders.ts`; `src/app/vendor-dashboard/[id]/orders/page.tsx` |
| Code and confirmation | `src/lib/delivery-code.ts`; `services/marketplace/vendor-delivery/handover/*` (code, deadline, submit, booking actions, manifest, admin operations); `delivery/shared/complete-delivered-item.ts` (extracted from `confirm-delivery.ts`); `confirm-delivery.ts` and `mark-out-for-delivery.ts` (refuse vendor items); `require-delivery-item.ts`; `checkout/confirm-payment-by-reference.ts` (issues the code after payment) |
| Assignment and briefing | `vendor-delivery/slot-briefing.ts`; `src/app/api/cron/vendor-slot-briefing/route.ts`; `src/lib/cron-auth.ts`; `delivery/assign-delivery.ts` (fix: a vendor collected by several deliverers in one slot no longer has the first deliverer's pickup code wiped by the second assignment) |
| UI and API | `src/app/admin/delivery-operations/page.tsx`, `api/marketplace/admin/delivery-operations/**`, `src/app/deliverer/_components/*`, `src/app/deliverer/page.tsx`, `api/marketplace/deliverer/{manifest,bookings/**}`, `order/list-buyer-orders.ts`, `src/app/orders/page.tsx`, `AdminMainMenu.tsx`, `notifications/email.service.ts` (2 templates) |
| Schema | migration `20261020120000_vendor_delivery_handover` (adds `DeliveryHandoverCode`, `DeliveryCodeSubmission`, `SlotBriefingNotice` and `DeliveryShiftCheckIn` in schema `marketplace`, plus `DeliveryRosterSettings.checkInLocation`; nothing in `public`), `prisma/schema.prisma`, `db/runtime-grants.json`, `db/provision/marketplace-roles.sql` (identical to the generator's output) |
| Config and docs | `.env.example` (`DELIVERY_CODE_SECRET`), `src/instrumentation.ts` (warning), `README.md` |

### Tests (local replica, 2026-10-19)

- `npm test`: **202/202 pass**. That includes the new `vendor-delivery-rules.test.ts` (12 tests, no database) and
  `vendor-delivery-handover.test.ts` (12 tests, including shift check-in, gating and missed shifts).
- Two existing tests were updated for intended changes:
  - the roster test refunds through the admin path instead of the deleted vendor "fail"
  - the vendor-payment test now counts the student's new code email separately.
- `npm run lint`, `npm run typecheck` and `npm run build`: clean. `npm run test:db:setup` applied the new
  migration through the db-guard review.
- Covered:
  - **Cutoff:** 4:59/5:00/5:01, across midnight, longer-only admin cutoff, direct API call refused and the summary
    agreeing, and a payment started before the cutoff still completing.
  - **Code:** issued only after verified payment, once (replayed confirmation), never in subject, outbox or
    notification. The student sees it; the card and API show only the mask.
  - **Vendors:** can't mark ready, and paid items are assignable.
  - **Confirmation:** a wrong code counts, another deliverer gets 404, the mask is refused. The correct code
    completes it once, sets escrow to payout-eligible, and starts the 24 h dispute window. A replay is idempotent,
    and a reused `submissionId` is refused.
  - **Lock:** after 5 wrong codes, then an admin reissue (with reason, audited) kills the old code.
  - **Deadline:** a late correct code becomes LATE_REVIEW, an admin accept is recorded as an admin action, and a
    second review is refused.
  - **Reassignment:** with a reason, and the old pickup code dies.
  - **Briefing:** not before T−2h; auto-assigns; admin and deliverer notified once; unpaid excluded; a second run
    sends nothing.
- **Not covered by automated tests:** the browser UI. I didn't click through it, and offline sync on a real phone
  is untested.

### Known limitations and open questions

1. **AkadVerse compatibility.** Both apps share the data, and AkadVerse's code is unchanged:
   - If AkadVerse still serves Vendor Market checkout or vendor dashboards, its checkout has no two-hour cutoff or
     codes, and its vendors still see Ready/Fail. Its delivery code also still requires `READY_FOR_PICKUP` for
     vendor items.
   - Nothing it writes breaks the new flow. Still, decide whether Vendor Market now lives only here.
2. **One meeting point for everyone.** It's a single setting, because all deliverers are currently male. **This
   must change once female deliverers join:** they will need separate meeting points (and probably separate
   admins to check them in). `DeliveryRosterSettings.checkInLocation` and `shift.ts` are the places to change.
   After a slot ends, a missed shift can only be unlocked by an admin with a reason, and it stays on the
   deliverer's record. A missed shift's deliveries need reassigning or unlocking; admins are notified, but nothing
   reassigns them automatically.
2a. **Vendor manager = admin** (decided with the owner). There is no separate role. The phone number on the card is
   the deliverer's; vendor contact is the vendor's own published `contactInfo`. There is no calling integration.
3. **Offline codes sit in localStorage in plaintext** until synced (at most 48 h). Anyone with the unlocked phone
   or script access to the site could read them.
4. The per-item **retry after a failed attempt** (24 h, existing) extends the confirmation deadline, but the
   delivery-retry job that returns items to the pool is one of the unscheduled AkadVerse jobs (README).
5. The vendor "prep deadline" (`vendorPrepDeadlineMins`) and the fixed 30-min deliverer arrival rule are kept as
   information on the card. Nothing waits on the vendor any more.
6. **Vendor payouts still don't wait for the 24 h dispute window** (only deliverer payouts do). This is unchanged,
   and needs a decision.
7. **Production steps (need approval):**
   - `npm run db:migrate` (applies both pending migrations)
   - set `DELIVERY_CODE_SECRET` on Vercel
   - point cron-job.org at the briefing endpoint.

## 1. Files changed (Marketplace only)

| Kind | Files |
|---|---|
| New | `prisma/marketplace-schema/` (migration-only schema and `20261015120000_marketplace_schema_init`), `db/runtime-grants.json`, `db/provision/marketplace-roles.sql` (generated, passwords redacted), `scripts/{provision-db-roles.mjs, setup-local-db.mjs, sync-shared-schema.mjs, db-verify.ts, verify-e2e.ts}`, `src/lib/{db-target.ts, account-state.ts}`, `tests/db/runtime-role.test.ts`, `tests/helpers/akadverse.ts` |
| Rewritten | `prisma/schema.prisma` (shared region generated from AkadVerse's file, plus 3 `marketplace` models), `src/lib/{prisma,auth,session,akadverse-identity,account-domains}.ts`, `src/instrumentation.ts`, `scripts/{db-guard.mjs, grant-admin.ts}`, `src/app/signup/page.tsx` (now links to AkadVerse), `tests/auth/*`, `tests/helpers/{env,fixtures,setup-test-db}`, `README.md`, `.env.example`, this report |
| Edited | `services/marketplace/admin/{block-user,get-user-detail,search-users}.ts`, `src/lib/{admin,cron-auth,throttle}.ts`, `src/proxy.ts`, login page/form/shell, `AppNotifications.tsx`, `auth-shell.tsx`, `email.service.ts` (reset email removed), `src/types/next-auth.d.ts`, `package.json` (scripts), `vercel.json` (no crons), `next.config.ts`, `docker-compose.yml`, `scripts/docker-init.sql`, `.env` (see section 2) |
| Deleted | `services/auth/**` (registration, sign-up OTP, password reset), `src/app/api/{signup,password}/**`, `src/app/{forgot-password,reset-password}/**`, `src/app/signup/{SignupForm,SignupPageShell}.tsx`, `src/app/components/otp-input.tsx`, `src/lib/admin-identity.ts`, `scripts/verify-standalone.ts`, `prisma/migrations/` (the old standalone database's history) |

**AkadVerse: no changes.** HEAD, `git status`, `git diff` and the SHA-256 of every file (including `.env`) are
identical to the baseline taken before the work.

## 2. Environment variables (names only)

- **Added:** `MARKETPLACE_ENV`, `AKADVERSE_DATABASE_URL` (runtime, `marketplace_app`), `AKADVERSE_DB_PROJECT_REF`,
  `MARKETPLACE_MIGRATION_DATABASE_URL` (migrator; not part of the runtime deployment), `MARKETPLACE_DB_CONFIRM_HOST`,
  `MARKETPLACE_ALLOW_DESTRUCTIVE`, `NEXT_PUBLIC_AKADVERSE_URL`, `MARKETPLACE_SCHEDULED_JOBS`.
- **Operator shell only:** `PROVISION_ADMIN_DATABASE_URL`, `MARKETPLACE_APP_DB_PASSWORD`,
  `MARKETPLACE_MIGRATOR_DB_PASSWORD`.
- **Removed:** `MARKETPLACE_DATABASE_URL`, `MARKETPLACE_DIRECT_URL`, `AKADVERSE_AUTH_DATABASE_URL`,
  `MARKETPLACE_ADMIN_EMAILS`, `MARKETPLACE_STUDENT_EMAIL_DOMAIN`.
- **Security finding, fixed:** the Marketplace `.env` held AkadVerse's **full-access production credential** in
  `AKADVERSE_AUTH_DATABASE_URL`, byte-identical to AkadVerse's `DIRECT_URL`. It has been removed, and `.env` now
  points at the local replica. The app also now refuses any `postgres`/`service_role`/`supabase_admin`/migrator URL
  outright (tested with that very credential: refused before connecting). **Consider rotating that password**, since
  it sat in a second project's file. A copy also exists in this session's scratchpad backup
  (`marketplace-before.tgz`), which you may want to delete.
- **Shared with AkadVerse (the same values, found in `.env`):** Paystack, Resend, Cloudinary, Google OAuth and
  `CRON_SECRET`. The first four are intended to be the same accounts. `CRON_SECRET` should be the Marketplace's own.
  `NEXTAUTH_SECRET` is already distinct.

## 3. Models and tables reused

All 32 shared models were copied verbatim from AkadVerse's `prisma/schema.prisma` by `scripts/sync-shared-schema.mjs`,
with no `@@map` in either schema: User, Business, BusinessDeliveryDay, BusinessVerificationRequest, BusinessReport,
AdminActionLog, MarketplaceSettings, Product, ProductImage, ProductVariant, VariantField, VariantValue,
VariantValueOnProductVariant, Side, CartItem, CheckoutPayment, Order, OrderItem, OrderEvent, VendorDeliveryBooking,
VendorDeliverySlot, VendorTimeframeCapacity, VendorTimeframeCapacityOverride, VendorDeliveryDateOverride,
DelivererRosterAssignment, Deliverer, Delivery, DeliveryItem, Delivery_x_businesses, LateDeliveryFine, Notification,
EmailDelivery.

The `public` schema gets 0 new tables. The Marketplace-owned tables in `marketplace` are: AccountState (blocks and
session version; foreign key to `User(id)` ON DELETE CASCADE), AuthThrottle, and MarketplaceInstance (environment
marker).

## 4. Schema differences found

| Finding | Effect | Resolution |
|---|---|---|
| Production has 14 of AkadVerse's 17 migrations. **Missing: CheckoutPayment, EmailDelivery, VendorDeliveryDateOverride** and enums CheckoutKind, CheckoutPaymentStatus, EmailDeliveryStatus. They come from AkadVerse's uncommitted `20261013091929_*` and `20261013123945_*` | The Marketplace code (extracted from AkadVerse's working tree) needs them | AkadVerse ships them (decision 1). Provisioning refuses until they exist; this was tested on a replica in production's current state |
| `20260923120000_role_elearning_values` is applied in effect but not recorded in production's `_prisma_migrations` | `migrate deploy` will run it | It uses `IF NOT EXISTS`, so it is a no-op that then gets recorded |
| AkadVerse's **committed** payment webhook marks orders paid by reference without the `CheckoutPayment` flow | If AkadVerse ran old code alongside, Marketplace checkouts would be finalized differently | **AkadVerse must deploy its working-tree code together with those migrations** before Marketplace go-live; then both apps run identical code |
| The old standalone `User` had `blocked`, `sessionVersion`, `akadverseUserId`, nullable `password`; PendingSignup/PasswordResetToken differed | These don't exist in AkadVerse | Moved to `marketplace.AccountState`; linking, registration and reset removed |
| Every other shared table matches AkadVerse's schema exactly | — | Replica drift test: no differences in either schema |

## 5. Permissions

**Live production state (read-only):**

- All `public` tables are owned by `postgres`, with no ACLs, no RLS and no policies.
- `anon` and `authenticated` have no USAGE on `public`.
- There are no default privileges for `public` and no `public` functions.
- The one sequence belongs to `student_playlists`, which the Marketplace doesn't use.
- PUBLIC has database CONNECT/TEMP.
- `postgres` is not a superuser but has CREATEROLE, CREATEDB, REPLICATION and BYPASSRLS.

**`marketplace_app` is granted:**

- CONNECT; USAGE on `public` and `marketplace`.
- The row privileges in `db/runtime-grants.json`. `User` is column-level: SELECT on 16 listed columns; UPDATE only
  on `isAdmin`, the six deliverer student-email OTP columns, and `updatedAt`.
- In `marketplace`: S/I/U/D on AccountState and AuthThrottle; SELECT on the marker.

**`marketplace_migrator` is granted:** ownership of schema `marketplace`, USAGE on `public`, and REFERENCES on
`User(id)`.

**Explicitly denied (and tested):**

- SUPERUSER, CREATEDB, CREATEROLE, BYPASSRLS, REPLICATION.
- Any role membership, including SET ROLE to the owner or migrator.
- Ownership of any object, so no ALTER, DROP or TRUNCATE.
- CREATE on the database or on either schema.
- Any access to Task, Schedule, Suggestion, EmailConnection, Skill\*, Review, Category, student_playlists,
  PendingSignup and `_prisma_migrations`.
- INSERT or DELETE on User, and UPDATE of password, email or role.
- DELETE on Business, Order and AdminActionLog, and UPDATE on AdminActionLog.
- Changing the environment marker; CREATE EXTENSION; GRANT.
- The `storage`, `auth` and `vault` schemas (no USAGE).

**Narrowest-solution notes:**

- Reading `User.password` is required to verify sign-ins without AkadVerse's website. It is read-only and never
  copied.
- Admin user search reads all users' names and emails. That is the existing admin workflow.

## 6. Authentication and sessions

- Sign-in uses the AkadVerse email and password (bcrypt against the `User` row), or Google for an existing account.
  The session id is the AkadVerse `User.id`, so no linking or duplicate rows are possible.
- Students only, as in AkadVerse. Admin is AkadVerse's `User.isAdmin`; the `MARKETPLACE_ADMIN_EMAILS` auto-grant was
  removed because it would silently grant AkadVerse admin.
- Sessions are unchanged in design: own secret, `mkt.*` cookies, 30 days, re-validated on every request. Sessions
  now also end when AkadVerse deletes the account or changes its role.
- **Removed:** Marketplace sign-up and password reset. `/signup` links to AkadVerse. AkadVerse has no reset flow, so
  users who forget a password need support (section 9).
- Tokens from the old standalone app reference user ids that don't exist here and are rejected. Set a new
  `NEXTAUTH_SECRET` at cutover anyway.

## 7. Storage

There are no changes. The Marketplace uses Cloudinary (same account as AkadVerse) and has never used Supabase
Storage. The only bucket, `Akadverdse documents`, is private and holds E-Learning files under `2026-2027/`. The
Marketplace roles have no access to `storage`, and no Supabase key is configured.

## 8. Tests run

| Check | Result |
|---|---|
| `npm test` (local replica, app as `marketplace_app`) | **129 passed, 0 failed** |
| — of which `tests/db/runtime-role.test.ts` | 12: shared-record visibility (business create/edit/approve/reject, product with variants/images, both directions); DDL, unrelated-table, login, role and privilege denials; verifier detects extra grants and a wrong-environment marker; manifest covers every Prisma operation in the code (mutation-checked); schema matches AkadVerse's file and the replica |
| — `tests/auth/*` | Sign-in, generic failures, live password change, students only, throttling, Google decisions, admin from `isAdmin`, block/unblock, session revocation, cascade on account deletion, gate and cookies, URL/env safeguards, migration guard and SQL review, cron gating, uploads |
| — `tests/marketplace/*` (inherited) | Checkout, payment, webhook signature/idempotency, email outbox, vendor schedule/ownership: all pass on the new role |
| Browser (`scripts/verify-e2e.ts`, real Chrome, `next start`) | **63 passed, 0 failed**, and no `permission denied` in the server log |
| `typecheck`, `lint`, `build` | Pass |
| `schema:check`, `db:verify`, `db:check` | Pass (local) |
| Provisioning against a replica in production's **current** state | Refused atomically: "AkadVerse tables missing: CheckoutPayment, VendorDeliveryDateOverride, EmailDelivery" |
| Provisioning re-run | Idempotent |
| Probes | Unauthenticated API, cron and unsigned webhook → 401; cron with secret → 503 (jobs off) |

**Not run:**

- Anything against production beyond the read-only inspection.
- Supabase's pooler with the custom roles, and SSL settings.
- Real Paystack, Resend, Cloudinary or Google.
- AkadVerse's own test suite (its files are unchanged).

## 9. Remaining risks and manual steps (need your approval or action)

1. **AkadVerse deploys its working-tree code and the pending migrations.** This is the prerequisite for everything
   below.
2. **Create the roles in production:** `npm run db:roles:print`, review, then `db:roles:apply` (README "Database
   roles"). This changes production privileges and is waiting on your approval.
3. **Apply the Marketplace schema migration** as the migrator (`npm run db:migrate`, with `MARKETPLACE_ENV=production`).
   It is additive and only touches `marketplace`.
4. Set the production variables, then run `npm run db:verify`. This confirms that Supabase's pooler accepts
   `marketplace_app.<ref>` and that SSL works.
5. **Scheduled jobs:** keep them in AkadVerse (default). If you move them, disable them in AkadVerse first, then set
   `MARKETPLACE_SCHEDULED_JOBS=enabled`.
6. Paystack webhook: leave it on AkadVerse. Google OAuth: add `<marketplace-url>/api/auth/callback/google`.
   Set a new `CRON_SECRET`.
7. **Rotate AkadVerse's database password** (see section 2).
8. **Risks:**
   - Losing Marketplace password reset is a regression for users until AkadVerse has one.
   - Shared provider accounts mean a key rotation affects both apps.
   - Payout and cron safety depend on step 5.
   - Future AkadVerse migrations require `schema:sync` and, for new needs, a reviewed manifest change. The tests
     enforce this.
9. Local leftovers: the old standalone databases (`akadverse_marketplace`, `_test`, `fake_akadverse_identity`) are
   still in the local Docker volume and unused. The new replicas are `akadverse_replica` and
   `akadverse_replica_test`.
