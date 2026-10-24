-- Student-orchestrated Vendor Market delivery (services/marketplace/vendor-delivery/handover/). Additive: new types and
-- tables, all inside schema "marketplace". Nothing in "public" is created, altered, dropped or referenced — booking,
-- deliverer and user ids are plain TEXT validated by the application. No existing row is read or changed, so this is
-- safe to apply while the app is running.

CREATE TYPE "marketplace"."DeliverySubmissionOutcome" AS ENUM ('VERIFIED', 'REJECTED', 'LATE_REVIEW');

-- One student handover code per Vendor delivery booking (one delivery to one student, however many vendors it spans).
-- The code itself is never stored in plaintext: codeHash (HMAC bound to the booking) verifies it, codeCipher
-- (AES-GCM, server key) lets the student see it again in their order, maskedCode is the deliverer's 3-of-6 view.
CREATE TABLE "marketplace"."DeliveryHandoverCode" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeCipher" TEXT NOT NULL,
    "maskedCode" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryHandoverCode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeliveryHandoverCode_maskedCode_check" CHECK ("maskedCode" ~ '^[0-9_]{6}$'),
    CONSTRAINT "DeliveryHandoverCode_failedAttempts_check" CHECK ("failedAttempts" >= 0)
);

-- Every delivery-code submission a deliverer's app sends, online or synced later from an offline queue. submissionId is
-- the client's idempotency key (a replay returns the stored outcome). The submitted code is never stored.
-- receivedAt (server time) is what the 24-hour deadline is judged on; clientRecordedAt is audit information only.
CREATE TABLE "marketplace"."DeliveryCodeSubmission" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "delivererId" TEXT NOT NULL,
    "outcome" "marketplace"."DeliverySubmissionOutcome" NOT NULL,
    "reason" TEXT,
    "codeMatched" BOOLEAN NOT NULL,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "clientRecordedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewDecision" TEXT,
    "reviewNote" TEXT,

    CONSTRAINT "DeliveryCodeSubmission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeliveryCodeSubmission_reviewDecision_check" CHECK ("reviewDecision" IS NULL OR "reviewDecision" IN ('COMPLETED', 'DECLINED'))
);

-- Durable record of each pre-slot briefing sent (one row per slot occurrence and recipient), so a scheduler running
-- the job twice — or two schedulers — never notifies anyone twice.
CREATE TABLE "marketplace"."SlotBriefingNotice" (
    "id" TEXT NOT NULL,
    "operation" "marketplace"."DeliveryOperation" NOT NULL,
    "slotId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "recipientKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotBriefingNotice_pkey" PRIMARY KEY ("id")
);

-- The physical delivery card for one deliverer's share of one slot occurrence, handed over by the admin acting as
-- vendor manager. Acknowledgement only — no delivery state depends on it.
CREATE TABLE "marketplace"."DeliveryCardHandover" (
    "id" TEXT NOT NULL,
    "operation" "marketplace"."DeliveryOperation" NOT NULL,
    "slotId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "delivererId" TEXT NOT NULL,
    "handedOverAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handedOverBy" TEXT NOT NULL,

    CONSTRAINT "DeliveryCardHandover_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryHandoverCode_bookingId_key" ON "marketplace"."DeliveryHandoverCode"("bookingId");

CREATE UNIQUE INDEX "DeliveryCodeSubmission_submissionId_key" ON "marketplace"."DeliveryCodeSubmission"("submissionId");

CREATE INDEX "DeliveryCodeSubmission_bookingId_idx" ON "marketplace"."DeliveryCodeSubmission"("bookingId");

CREATE INDEX "DeliveryCodeSubmission_outcome_reviewedAt_idx" ON "marketplace"."DeliveryCodeSubmission"("outcome", "reviewedAt");

CREATE UNIQUE INDEX "SlotBriefingNotice_operation_slotId_date_recipientKey_key" ON "marketplace"."SlotBriefingNotice"("operation", "slotId", "date", "recipientKey");

CREATE UNIQUE INDEX "DeliveryCardHandover_operation_slotId_date_delivererId_key" ON "marketplace"."DeliveryCardHandover"("operation", "slotId", "date", "delivererId");

-- Runtime role, if provisioned (restricted mode): exactly the rows db/runtime-grants.json lists. Nothing here is ever
-- deleted except a briefing notice whose send failed (so the next run retries it).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marketplace_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "marketplace"."DeliveryHandoverCode" TO marketplace_app;
    GRANT SELECT, INSERT, UPDATE ON "marketplace"."DeliveryCodeSubmission" TO marketplace_app;
    GRANT SELECT, INSERT, DELETE ON "marketplace"."SlotBriefingNotice" TO marketplace_app;
    GRANT SELECT, INSERT ON "marketplace"."DeliveryCardHandover" TO marketplace_app;
  END IF;
END $$;
