// tests/helpers/akadverse.ts
//
// Stands in for AkadVerse itself in tests: a Prisma client connected as the OWNER of the public tables
// (akadverse_owner — the local equivalent of Supabase's "postgres"), used only for what AkadVerse does and the
// Marketplace may not: creating accounts, and reading rows back "as AkadVerse sees them". Never used by app code.

import { PrismaClient } from "@prisma/client";

export const akadverseDb = new PrismaClient({ datasourceUrl: process.env.AKADVERSE_TEST_OWNER_URL });
