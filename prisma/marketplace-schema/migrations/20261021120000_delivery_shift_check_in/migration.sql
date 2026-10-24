-- Deliverer shifts (services/marketplace/vendor-delivery/handover/shift.ts). Additive, inside schema "marketplace" only;
-- nothing in "public" is touched and no existing row is read or changed, so this is safe while the app is running.
--
-- Replaces the "delivery card handed over" acknowledgement from 20261020120000 with a real shift check-in that gates
-- the deliverer's pickups and deliveries, and adds the meeting point. The old "DeliveryCardHandover" table is left in
-- place (never used by the app; nothing is dropped) — only the runtime role's access to it is withdrawn.

-- A deliverer's shift (one slot occurrence they hold deliveries in) was started: they reported at the meeting point,
-- an admin (vendor manager) checked them in and handed over their card. Until then their pickups and deliveries for
-- that occurrence are refused; with no row by the slot's end the shift is missed. late = checked in only after the
-- slot ended (an admin unlocking a missed shift, with a note) — it still counts as missed.
CREATE TABLE "marketplace"."DeliveryShiftCheckIn" (
    "id" TEXT NOT NULL,
    "operation" "marketplace"."DeliveryOperation" NOT NULL,
    "slotId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "delivererId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedInBy" TEXT NOT NULL,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "DeliveryShiftCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryShiftCheckIn_operation_slotId_date_delivererId_key" ON "marketplace"."DeliveryShiftCheckIn"("operation", "slotId", "date", "delivererId");

-- Where deliverers report before their shift (one place per operation for now).
ALTER TABLE "marketplace"."DeliveryRosterSettings" ADD COLUMN "checkInLocation" TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marketplace_app') THEN
    GRANT SELECT, INSERT ON "marketplace"."DeliveryShiftCheckIn" TO marketplace_app;
    REVOKE ALL ON "marketplace"."DeliveryCardHandover" FROM marketplace_app;
  END IF;
END $$;
