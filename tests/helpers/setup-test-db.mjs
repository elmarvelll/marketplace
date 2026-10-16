// tests/helpers/setup-test-db.mjs  (npm run test:db:setup)
//
// Rebuilds the LOCAL test replica of AkadVerse's database (akadverse_replica_test): AkadVerse's migrations, the
// restricted roles, then the Marketplace's own migrations through scripts/db-guard.mjs. Local host only.

import { setupLocalDatabase } from "../../scripts/setup-local-db.mjs";

try {
  await setupLocalDatabase({ database: "akadverse_replica_test", env: "test", reset: true });
} catch (err) {
  console.error(`\n✖ ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
