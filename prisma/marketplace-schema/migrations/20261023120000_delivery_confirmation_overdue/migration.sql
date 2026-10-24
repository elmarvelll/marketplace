-- Simplified Vendor Market delivery (services/marketplace/vendor-delivery/handover/): no vendor pickup code, no admin
-- check-in gate — a delivery is completed only by the student's code, entered by the deliverer or, as an audited
-- fallback, by an admin. Additive, inside schema "marketplace" only: nothing in "public" is touched and no existing row
-- is changed (new columns have defaults), so this is safe while the app is running.

CREATE TYPE "marketplace"."DeliveryConfirmationMethod" AS ENUM ('DELIVERER', 'ADMIN_FALLBACK');

-- Who entered each code submission and how. Existing rows were all entered by the deliverer.
--   enteredBy      the admin's user id for ADMIN_FALLBACK (null for the deliverer's own submissions)
--   fallbackReason required for ADMIN_FALLBACK
--   late           received by the server at or after the confirmation deadline
ALTER TABLE "marketplace"."DeliveryCodeSubmission"
    ADD COLUMN "method" "marketplace"."DeliveryConfirmationMethod" NOT NULL DEFAULT 'DELIVERER',
    ADD COLUMN "enteredBy" TEXT,
    ADD COLUMN "fallbackReason" TEXT,
    ADD COLUMN "late" BOOLEAN NOT NULL DEFAULT false;

-- A booking whose delivery-code deadline (end of the delivery day, school time) passed without a valid confirmation.
-- Raised by the vendor-slot-briefing job, once per (booking, deadline). Never deleted: when the booking is later
-- delivered or cancelled the row is resolved, so the overdue history stays.
CREATE TABLE "marketplace"."DeliveryConfirmationOverdue" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "flaggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminsNotifiedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "DeliveryConfirmationOverdue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryConfirmationOverdue_bookingId_deadlineAt_key" ON "marketplace"."DeliveryConfirmationOverdue"("bookingId", "deadlineAt");
CREATE INDEX "DeliveryConfirmationOverdue_resolvedAt_idx" ON "marketplace"."DeliveryConfirmationOverdue"("resolvedAt");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marketplace_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "marketplace"."DeliveryConfirmationOverdue" TO marketplace_app;
  END IF;
END $$;
