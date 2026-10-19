-- Recurring delivery rosters (services/marketplace/delivery-roster/). Additive: new types and tables, all inside schema
-- "marketplace". Nothing in "public" is created, altered, dropped or referenced — slot, deliverer, order and booking ids
-- are plain TEXT validated by the application (the migration role holds no REFERENCES on those tables). No existing
-- row anywhere is read or changed, so this is safe to apply while the app is running.

CREATE TYPE "marketplace"."DeliveryOperation" AS ENUM ('MARKETPLACE', 'VENDOR');

CREATE TYPE "marketplace"."DeliveryPlanSource" AS ENUM ('ROSTER', 'MANUAL');

CREATE TABLE "marketplace"."DeliveryRosterSettings" (
    "operation" "marketplace"."DeliveryOperation" NOT NULL,
    "defaultMaxDeliveries" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "DeliveryRosterSettings_pkey" PRIMARY KEY ("operation"),
    CONSTRAINT "DeliveryRosterSettings_defaultMaxDeliveries_check" CHECK ("defaultMaxDeliveries" IS NULL OR "defaultMaxDeliveries" >= 0)
);

CREATE TABLE "marketplace"."CentralDeliverySlot" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "windowStart" TEXT NOT NULL,
    "windowEnd" TEXT NOT NULL,
    "staffPositions" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentralDeliverySlot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CentralDeliverySlot_window_check" CHECK ("windowStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "windowEnd" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "windowStart" < "windowEnd"),
    CONSTRAINT "CentralDeliverySlot_staffPositions_check" CHECK ("staffPositions" >= 0)
);

CREATE TABLE "marketplace"."RosterSlotDay" (
    "id" TEXT NOT NULL,
    "operation" "marketplace"."DeliveryOperation" NOT NULL,
    "slotId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "maxDeliveries" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "RosterSlotDay_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RosterSlotDay_weekday_check" CHECK ("weekday" BETWEEN 1 AND 7),
    CONSTRAINT "RosterSlotDay_maxDeliveries_check" CHECK ("maxDeliveries" IS NULL OR "maxDeliveries" >= 0)
);

CREATE TABLE "marketplace"."RosterAssignment" (
    "id" TEXT NOT NULL,
    "operation" "marketplace"."DeliveryOperation" NOT NULL,
    "slotId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "delivererId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RosterAssignment_weekday_check" CHECK ("weekday" BETWEEN 1 AND 7)
);

CREATE TABLE "marketplace"."RosterException" (
    "id" TEXT NOT NULL,
    "operation" "marketplace"."DeliveryOperation" NOT NULL,
    "slotId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "maxDeliveries" INTEGER,
    "replaceDeliverers" BOOLEAN NOT NULL DEFAULT false,
    "delivererIds" TEXT[],
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RosterException_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RosterException_maxDeliveries_check" CHECK ("maxDeliveries" IS NULL OR "maxDeliveries" >= 0)
);

CREATE TABLE "marketplace"."ScheduledDelivery" (
    "id" TEXT NOT NULL,
    "operation" "marketplace"."DeliveryOperation" NOT NULL,
    "orderId" TEXT,
    "bookingId" TEXT,
    "slotId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "plannedDelivererId" TEXT,
    "planSource" "marketplace"."DeliveryPlanSource" NOT NULL DEFAULT 'ROSTER',
    "plannedBy" TEXT,
    "plannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledDelivery_pkey" PRIMARY KEY ("id"),
    -- A Business delivery is one order; a Vendor delivery is one booking. Never both, never neither.
    CONSTRAINT "ScheduledDelivery_subject_check" CHECK (
        ("operation" = 'MARKETPLACE' AND "orderId" IS NOT NULL AND "bookingId" IS NULL) OR
        ("operation" = 'VENDOR' AND "bookingId" IS NOT NULL AND "orderId" IS NULL)
    )
);

CREATE INDEX "CentralDeliverySlot_active_idx" ON "marketplace"."CentralDeliverySlot"("active");

CREATE UNIQUE INDEX "RosterSlotDay_operation_slotId_weekday_key" ON "marketplace"."RosterSlotDay"("operation", "slotId", "weekday");

CREATE INDEX "RosterAssignment_delivererId_idx" ON "marketplace"."RosterAssignment"("delivererId");

CREATE UNIQUE INDEX "RosterAssignment_operation_slotId_weekday_delivererId_key" ON "marketplace"."RosterAssignment"("operation", "slotId", "weekday", "delivererId");

CREATE INDEX "RosterException_operation_date_idx" ON "marketplace"."RosterException"("operation", "date");

CREATE UNIQUE INDEX "RosterException_operation_slotId_date_key" ON "marketplace"."RosterException"("operation", "slotId", "date");

CREATE UNIQUE INDEX "ScheduledDelivery_orderId_key" ON "marketplace"."ScheduledDelivery"("orderId");

CREATE UNIQUE INDEX "ScheduledDelivery_bookingId_key" ON "marketplace"."ScheduledDelivery"("bookingId");

CREATE INDEX "ScheduledDelivery_operation_slotId_date_idx" ON "marketplace"."ScheduledDelivery"("operation", "slotId", "date");

CREATE INDEX "ScheduledDelivery_plannedDelivererId_idx" ON "marketplace"."ScheduledDelivery"("plannedDelivererId");

-- Runtime role, if provisioned (restricted mode): exactly the rows db/runtime-grants.json lists. ScheduledDelivery has
-- no DELETE — a delivery's history is kept even after its order is cancelled.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marketplace_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "marketplace"."DeliveryRosterSettings" TO marketplace_app;
    GRANT SELECT, INSERT, UPDATE ON "marketplace"."CentralDeliverySlot" TO marketplace_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "marketplace"."RosterSlotDay" TO marketplace_app;
    GRANT SELECT, INSERT, DELETE ON "marketplace"."RosterAssignment" TO marketplace_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "marketplace"."RosterException" TO marketplace_app;
    GRANT SELECT, INSERT, UPDATE ON "marketplace"."ScheduledDelivery" TO marketplace_app;
  END IF;
END $$;
