-- Runs once, on the first start of the local container (empty volume). Nothing to do: the local replicas of
-- AkadVerse's database (akadverse_replica, akadverse_replica_test) are built by scripts/setup-local-db.mjs
-- (npm run db:local:setup / npm run test:db:setup).
SELECT 1;
