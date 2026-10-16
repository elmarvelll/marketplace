// tests/helpers/session.ts
//
// Lets a test act as a signed-in user for services that read the session (requireOwnedBusiness / requireOwnedVendor /
// requireAdmin). Replaces src/lib/session.ts's getActiveSession with one that returns whoever `signInAs` last set —
// still passed through the real resolveSession, so blocked users and revoked sessions behave exactly as in the app.
// Must be imported (after ./env) BEFORE any app module, and needs `--experimental-test-module-mocks` (see `npm test`).

import { mock } from "node:test";
import path from "node:path";

let current: { id: string; email: string } | null = null;

const sessionModule = path.join(process.cwd(), "src/lib/session.ts");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const real = require(sessionModule) as typeof import("@/lib/session");

mock.module(sessionModule, {
  namedExports: {
    ...real,
    getActiveSession: async (options: { throwIfBlocked?: boolean } = {}) => {
      if (!current) return null;
      const session = { expires: new Date(Date.now() + 3600_000).toISOString(), user: { id: current.id, email: current.email, name: "", firstName: "", isAdmin: false } };
      return real.resolveSession(session, undefined, options);
    },
  },
});

export function signInAs(user: { id: string; email: string } | null) {
  current = user ? { id: user.id, email: user.email } : null;
}
