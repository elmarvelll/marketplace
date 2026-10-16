-- Marketplace-owned tables, all inside schema "marketplace" (created beforehand by db/provision; owned by
-- marketplace_migrator). Nothing here creates, alters or drops anything in "public": the only reference to AkadVerse's
-- tables is the foreign key from AccountState to public."User"(id), which cascades so that deleting an account in
-- AkadVerse also removes its Marketplace state (and never blocks that delete).

CREATE TABLE "marketplace"."AccountState" (
    "userId" TEXT NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "blockedBy" TEXT,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountState_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "AccountState_blocked_idx" ON "marketplace"."AccountState"("blocked");

ALTER TABLE "marketplace"."AccountState" ADD CONSTRAINT "AccountState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "marketplace"."AuthThrottle" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "AuthThrottle_updatedAt_idx" ON "marketplace"."AuthThrottle"("updatedAt");

CREATE TABLE "marketplace"."MarketplaceInstance" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "app" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceInstance_pkey" PRIMARY KEY ("id")
);

-- Runtime role, if it has been provisioned (restricted mode): row operations only, and only what the app does (see
-- db/runtime-grants.json). The marker is read-only to it, so the app can't re-label which environment a database
-- belongs to. In full-access mode (AkadVerse's own login, no marketplace_app role) there is nothing to grant.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marketplace_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "marketplace"."AccountState" TO marketplace_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "marketplace"."AuthThrottle" TO marketplace_app;
    GRANT SELECT ON "marketplace"."MarketplaceInstance" TO marketplace_app;
  END IF;
END $$;
