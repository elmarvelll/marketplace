// src/app/api/auth/[...nextauth]/route.ts
//
// NextAuth's own endpoints (sign-in, sign-out, session, CSRF token, OAuth callbacks) for the standalone Marketplace.
// Configuration lives in src/lib/auth.ts.

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
