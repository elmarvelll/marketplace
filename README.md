# AkadVerse Marketplace — standalone application

The AkadVerse Marketplace as its own application, with its own code, deployment, environment and sign-in sessions,
running on **AkadVerse's live database**. Businesses, products, orders and payments are the same rows AkadVerse reads
and writes, so there is one source of truth, no copy and no synchronisation. The app connects as a **restricted
database role** that can do only the row operations the Marketplace needs.

What changed, why, and what was tested: [`EXTRACTION_REPORT.md`](EXTRACTION_REPORT.md).

## Current setup (2026-10-15): live database, AkadVerse's own login

The Marketplace is connected to AkadVerse's **live** Supabase database, with **AkadVerse's own full-access login**
(`MARKETPLACE_DB_ACCESS=full`, an owner decision). The same accounts, businesses and products are visible in both
apps, and a change in either is immediately visible in the other. Sessions are separate: each URL, browser and device
has its own cookie.

- Done on live: AkadVerse's 3 pending migrations were applied, and schema `marketplace` (AccountState, AuthThrottle,
  marker `production`) was created. `public` still matches AkadVerse's schema exactly.
- In full-access mode the startup check still enforces the Supabase project, AkadVerse's tables and the
  `production` marker. It skips the privilege checks: that login can change anything, so treat the Marketplace's env
  as AkadVerse's database password.
- **`npm run dev` now works on real data.** For local experiments, switch `.env` back to the local replica
  (section "Local development").
- To move to the restricted role later: run provisioning (section "Database roles"), set `AKADVERSE_DATABASE_URL`
  to `marketplace_app`, and remove `MARKETPLACE_DB_ACCESS`.
- Payments: AkadVerse's live (older) webhook may mark a Marketplace order paid first. The Marketplace then settles
  its checkout without sending duplicate events or emails (`markOrdersPaid` in
  `services/marketplace/checkout/confirm-payment-by-reference.ts`).

## Architecture

```text
Browser ── mkt.* cookies (own secret) ──▶ Marketplace (Next.js, port 3000)
                                           │  src/lib/session.ts re-checks the account on every request
                                           │  src/lib/db-target.ts verifies database + role at startup
                                           ▼
             AkadVerse's Supabase Postgres, as role marketplace_app (row access only, per db/runtime-grants.json)
             ├── schema public       AkadVerse's tables, owned and migrated by AkadVerse
             │     User (read; isAdmin + deliverer-OTP columns writable), Business, Product, Order, CheckoutPayment, ...
             └── schema marketplace  Marketplace-only: AccountState (blocks, session revocation), AuthThrottle, marker
                                           ▲
AkadVerse (unchanged) ── its own sessions, postgres role ──┘
```

- **Authoritative database:** AkadVerse's Supabase project. The old standalone database is no longer used.
- **Shared entities (schema `public`, 32 tables):** `User`, `Business` and its delivery days, verification requests
  and reports, `Product` with images, variants and sides, `CartItem`, `CheckoutPayment`, `Order`, `OrderItem`,
  `OrderEvent`, vendor bookings, slots, capacity and overrides, deliverers, deliveries and roster, `LateDeliveryFine`,
  `Notification`, `EmailDelivery`, `AdminActionLog` and `MarketplaceSettings`. The full list with privileges is in
  [`db/runtime-grants.json`](db/runtime-grants.json).
- **Marketplace-owned (schema `marketplace`):** `AccountState`, `AuthThrottle` and `MarketplaceInstance`. AkadVerse's
  Prisma only manages `public`, so it never sees these tables or treats them as drift.
- **Not touched:** Task, Schedule, Suggestion, EmailConnection, Skill\*, Review, Category, student_playlists,
  PendingSignup, AkadVerse's `_prisma_migrations`, the E-Learning database, and Supabase Storage. The runtime role has
  no privilege on any of them.

## Database roles

Two roles, both created by [`scripts/provision-db-roles.mjs`](scripts/provision-db-roles.mjs) from the manifest. The
reviewable SQL is in [`db/provision/marketplace-roles.sql`](db/provision/marketplace-roles.sql), with passwords
redacted.

| Role | Used by | Can | Cannot |
|---|---|---|---|
| `marketplace_app` | the running app | CONNECT; USAGE on `public` and `marketplace`; exactly the SELECT/INSERT/UPDATE/DELETE in the manifest. `User` is column-level: it can read the listed columns and update only `isAdmin`, the deliverer student-email OTP columns and `updatedAt` | own anything (so no ALTER, DROP or TRUNCATE); CREATE anything; touch unlisted tables; insert or delete users; change a password, email or role; SET ROLE to anything; bypass RLS; create roles or databases |
| `marketplace_migrator` | `npm run db:migrate` only | own schema `marketplace`; USAGE on `public`; REFERENCES on `User(id)`, for the `AccountState` foreign key | read or write any `public` row; CREATE in `public`; CREATE schemas; any role attribute or membership |

Neither role is a member of any other role, which rules out `postgres`, `service_role`, `authenticated` and
`pg_read_all_data`. AkadVerse's own `DIRECT_URL` and `DATABASE_URL` credentials are never given to the Marketplace.

**Provisioning** is done once per environment by an operator, with the privileged URL set only in their shell:

```bash
npm run db:roles:print                  # review the SQL (no connection)
export PROVISION_ADMIN_DATABASE_URL='<AkadVerse postgres URL, session port 5432>'
export MARKETPLACE_APP_DB_PASSWORD="$(openssl rand -base64 33 | tr -d '/+=' )"
export MARKETPLACE_MIGRATOR_DB_PASSWORD="$(openssl rand -base64 33 | tr -d '/+=')"
npm run db:roles:apply -- --confirm-host=aws-1-eu-north-1.pooler.supabase.com
unset PROVISION_ADMIN_DATABASE_URL
```

It runs in one transaction: either everything applies or nothing does. Passwords are sent as SCRAM verifiers, so the
plaintext never reaches the server. It refuses to run until AkadVerse's tables exist, including
`CheckoutPayment`, `EmailDelivery` and `VendorDeliveryDateOverride` (see "Go-live order"). Re-running it resets the
grants to the manifest. Omit a password variable to keep that role's current password.

## Go-live order (production)

1. **AkadVerse deploys its current working tree: code and its pending migrations** (`20261013091929_checkout_payments_and_email_outbox`,
   `20261013123945_vendor_delivery_date_override`; `20260923120000_role_elearning_values` is idempotent and also gets
   recorded). These steps must go together: AkadVerse's older code confirms payments without the `CheckoutPayment`
   bookkeeping the Marketplace relies on. Afterwards both apps run identical payment code on the same rows.
2. Provision the roles (above).
3. Migrate the Marketplace schema, as the migrator, from a shell or CI job:
   ```bash
   MARKETPLACE_ENV=production AKADVERSE_DB_PROJECT_REF=<ref> MARKETPLACE_DB_CONFIRM_HOST=<host> \
   MARKETPLACE_MIGRATION_DATABASE_URL='postgresql://marketplace_migrator.<ref>:<pw>@<host>:5432/postgres?schema=marketplace' \
   npm run db:migrate
   ```
   This also writes the marker `environment = production`.
4. Set the deployment's runtime variables (`MARKETPLACE_ENV`, `AKADVERSE_DATABASE_URL` as `marketplace_app`,
   `AKADVERSE_DB_PROJECT_REF`, a **new** `NEXTAUTH_SECRET`, and so on). Do not include the migration URL.
5. Check before sending traffic: `npm run db:verify` with the same variables must print "All database checks passed".
6. Deploy. Startup logs one line, `[marketplace:db] env=production target=… role=marketplace_app checks=passed`, and
   refuses to start on any problem.

## Startup safeguards

`src/lib/db-target.ts` runs at every start and in `npm run db:verify`, and checks the live server, not variable names:

- `MARKETPLACE_ENV` is set. Local and test environments must use a loopback host. Staging and production must match
  `AKADVERSE_DB_PROJECT_REF` in the pooler user or the direct host.
- The URL's role isn't a full-access one (`postgres`, `supabase_admin`, `service_role`, the migrator, …) and isn't
  the same connection as `DATABASE_URL`/`DIRECT_URL`.
- AkadVerse's tables exist, and `marketplace."MarketplaceInstance"` says this environment. This stops a staging
  deployment from writing to production.
- The role has no attributes, memberships, ownership or CREATE rights, and its effective privileges on every table,
  column and sequence equal the manifest. Extra privileges are refused, including any granted through PUBLIC.

Migrations are never run at startup.

## Authentication

- **Identity is AkadVerse's.** A person signs in with their AkadVerse email and password, checked by bcrypt against
  their `User` row, or with Google if the verified email matches an existing account. The session's user id **is**
  the AkadVerse `User.id`, so there are no duplicate users or account linking that could be forged.
- Only `role = student` accounts may use the Marketplace, as in AkadVerse.
- **Admin** = AkadVerse's `User.isAdmin`, the flag AkadVerse's own Marketplace admin dashboard uses. Promote or
  revoke from either app, or run `npm run admin:grant -- email [--revoke]`.
- **No sign-up or password reset here.** `/signup` links to AkadVerse (`NEXT_PUBLIC_AKADVERSE_URL`). The runtime role
  can't insert users or change passwords, so the Marketplace can't create accounts or alter an AkadVerse login.
  AkadVerse itself has no password reset today.
- **Independent sessions:** the app has its own `NEXTAUTH_SECRET` and its own `mkt.*` cookies (HttpOnly,
  SameSite=Lax, `__Secure-`/`__Host-` in production), with a 30-day expiry. Logging out of one app doesn't affect
  the other, and neither app's token is valid in the other.
- Every request re-reads the account. If it was deleted, is no longer a student account, is blocked in the
  Marketplace, or has had its session version bumped, the session ends on the next request.
- **Blocking is Marketplace-only** (`marketplace.AccountState`). It ends Marketplace sessions immediately and doesn't
  affect AkadVerse, which has no user-level block. Sign-in is throttled per email and per IP.
- No dependency on AkadVerse's website being up; only its database.
- Google: add `<NEXTAUTH_URL>/api/auth/callback/google` to the OAuth client's redirect URIs if you reuse AkadVerse's.

## Storage and images

The Marketplace stores images in **Cloudinary** (the same account as AkadVerse, so images keep working in both apps).
It never uses Supabase Storage. The project's only bucket, `Akadverdse documents`, is private and holds E-Learning
files; the Marketplace roles can't reach the `storage` schema, and no Supabase API key is configured here. Uploads
are checked server-side: a session is required, the type is detected from the file's bytes (JPEG/PNG/WebP/GIF only)
and the size is capped.

## Payments

The app uses AkadVerse's Paystack account. Paystack allows one webhook URL per mode, so keep it pointing at
AkadVerse. Once AkadVerse runs its current code (go-live step 1), its handler and the Marketplace's are the same code
on the same rows: whichever app receives `charge.success` finalizes that reference, idempotently, after verifying the
amount and currency with Paystack. Marketplace checkouts also complete through the browser's verify call and the
reconciler, without any webhook.

## Scheduled jobs

AkadVerse and the Marketplace have the same `/api/cron/*` jobs: payouts, seller auto-reject, dispute window,
deliverer emails, retries. On one database each must run in **one** app only, or deliverers get emails twice and
payout sweeps race. So here they are **off** (`503`) unless `MARKETPLACE_SCHEDULED_JOBS=enabled`, and `vercel.json`
schedules none. To move them, disable them in AkadVerse first, then enable them here and point a scheduler at them
with `Authorization: Bearer $CRON_SECRET`. Use a secret different from AkadVerse's. In-request work (checkout
reconcile, email retry) is idempotent per row and stays on.

## Schema changes

- **Shared tables (`public`) are AkadVerse's.** A Marketplace feature that needs a new column or table gets a
  migration in **AkadVerse's** `prisma/migrations`, reviewed and deployed with AkadVerse. Then:
  `npm run schema:sync` (copies the models from `../akadverse/prisma/schema.prisma` into the generated region of
  `prisma/schema.prisma`), review the diff, add any needed privilege to `db/runtime-grants.json`, re-run
  provisioning, and run `npm run db:verify`. Never edit the shared region by hand. The tests fail if it drifts from
  AkadVerse's file or the replica.
- **Never run `prisma db push`, `prisma migrate dev` or `prisma migrate reset` with `prisma/schema.prisma`.** It omits
  AkadVerse-only tables, so Prisma would try to drop them. There is no `directUrl`, and the runtime role can't drop
  anything, but don't try.
- **Marketplace-owned tables (`marketplace`):** add a hand-written SQL migration under
  `prisma/marketplace-schema/migrations/<timestamp>_<name>/`. `db-guard` refuses any migration that mentions
  `public` (except the `User(id)` reference), creates unqualified objects, grants to API roles, or contains
  DROP/TRUNCATE/DELETE/RENAME, unless `MARKETPLACE_ALLOW_DESTRUCTIVE=<name>` is set after review. Test it with
  `npm run test:db:setup && npm test`, get approval, then apply it with `npm run db:migrate` (step 3 above).

## Local development

Local work never touches AkadVerse's real database. It uses a replica built from AkadVerse's own migrations:

```bash
npm install
npm run db:up               # Docker Postgres on 127.0.0.1:5434
npm run db:local:setup      # replica "akadverse_replica": AkadVerse migrations (read from ../akadverse) → roles → Marketplace schema
cp .env.example .env        # values printed by the previous command; set NEXTAUTH_SECRET
npm run db:verify
npm run dev                 # http://localhost:3000
```

Create a local account the way AkadVerse would: sign up in a local AkadVerse pointed at the replica, or insert a
`User` row as `akadverse_owner`. Keep `PAYSTACK_MODE=test` and `RESEND_API_KEY` empty, so nothing is charged or
emailed.

## Tests and checks

```bash
npm run test:db:setup   # rebuilds akadverse_replica_test
npm test                # app runs as marketplace_app; accounts are created as AkadVerse would
npm run typecheck && npm run lint && npm run build
```

`tests/db/runtime-role.test.ts` covers several things:

- shared records written here are AkadVerse's rows;
- the role can't do DDL, reach unrelated tables, alter logins or assume roles;
- the verifier rejects extra privileges;
- every Prisma operation in the code is covered by the manifest;
- the schema matches AkadVerse's file and the replica.

### UI check

`scripts/verify-ui.ts` is a real-browser check of the storefront UI. It covers loading/empty/error states, the single
navbar, that Skills stays hidden, card clicks, add-to-cart, touch, and layout at 320–1440px. It seeds its own data
into the **local replica** and refuses non-local servers:

```bash
BASE_URL=http://localhost:3000 PP_DIR=<dir containing node_modules/puppeteer-core> npx tsx scripts/verify-ui.ts
```

### Contrast check

`scripts/verify-contrast.ts` measures WCAG contrast of all text and form fields on 27 pages, with the OS in light
and dark mode. It uses the same local-replica setup as the UI check (run `verify-ui.ts` once first; it seeds the
seller's shop).

### Browser check

```bash
npm run build && npx next start -p 3000      # with the local .env; set RESEND_API_KEY="" to send nothing
PP_DIR=<dir containing node_modules/puppeteer-core> npx tsx scripts/verify-e2e.ts
```

It refuses anything but the local replica.

## Verifying that Marketplace changes reach AkadVerse

1. Create a test business in the Marketplace and note its id.
2. In AkadVerse's admin dashboard, under Businesses and pending approval, the same business appears. In SQL:
   `SELECT id, name, "userId", "approvalStatus" FROM "Business" WHERE id = '<id>'`.
3. Approve it in either app; the other shows `APPROVED`.

Do this with a clearly named test record and remove it afterwards through the admin tools. Don't script writes
against production.

## Recovering from a failed deployment

- **App won't start:** read the `[marketplace:config] ERROR` lines. They name the failing check (env label, project
  ref, marker, privilege drift). Fix the configuration and don't widen privileges to get past it.
- **Roll back the app:** redeploy the previous build. Runtime changes are ordinary row writes that AkadVerse also
  understands, so there is nothing to undo in the schema.
- **Roll back provisioning:** re-run it from the previous `db/runtime-grants.json`. To remove the Marketplace
  entirely, as a privileged user: `DROP SCHEMA marketplace CASCADE; DROP OWNED BY marketplace_app, marketplace_migrator; DROP ROLE marketplace_app, marketplace_migrator;`.
  This removes only Marketplace-owned objects and grants; AkadVerse's tables are untouched.
- **Failed Marketplace migration:** it ran in a transaction as the migrator, which can't touch `public`. Fix it, then
  `npx prisma migrate resolve --rolled-back <name> --schema prisma/marketplace-schema/schema.prisma` (with the
  migrator URL) and deploy again.
- **Revoke access fast:** `ALTER ROLE marketplace_app NOLOGIN;` stops the Marketplace without touching AkadVerse.

## Known limitations

- Paystack, Resend and Cloudinary credentials are shared with AkadVerse, as is the Google OAuth client if reused.
  This is intended (same accounts), but rotating one affects both apps.
- `marketplace_app` can read every user's name and email, which the admin Users tab and order screens need, plus the
  password hash for sign-in. It can't write any of those.
- Supabase's pooler with custom roles, and SSL settings, have to be confirmed against the real project
  (`npm run db:check` and `npm run db:verify` do this). They weren't exercised from here.
- No Content-Security-Policy. Bank details are stored unencrypted, as in AkadVerse.
# marketplace
