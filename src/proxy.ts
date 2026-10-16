// src/proxy.ts
//
// Request gate for the standalone Marketplace (Next.js 16 "proxy", formerly middleware). It only decides whether a
// request has a session token at all:
//   - the sign-in page, the "create your account on AkadVerse" page, NextAuth, the Paystack webhook, and cron routes are public
//     (webhook = HMAC-authenticated, cron = CRON_SECRET-authenticated, inside their own handlers);
//   - everything else needs a session: pages redirect to /login (with a same-site callback path), APIs answer 401;
//   - /admin pages additionally need the admin flag.
// It reads this app's own cookie (mkt.session-token) with this app's own secret, so an AkadVerse session is not
// accepted here. It is a routing convenience, not the security boundary: every API handler re-checks the session
// against the database (src/lib/session.ts), which is where blocking, revocation and live admin status are enforced.

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PAGE_PATHS = ["/login", "/signup"];
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/webhooks", "/api/cron"];

const isProduction = process.env.NODE_ENV === "production";
const SESSION_COOKIE = `${isProduction ? "__Secure-" : ""}mkt.session-token`;

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const isPublicApi = PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (isPublicApi) return NextResponse.next();

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET, cookieName: SESSION_COOKIE, secureCookie: isProduction });

  if (PUBLIC_PAGE_PATHS.includes(pathname)) {
    // Already signed in: no reason to show the sign-in/sign-up forms again.
    if (token && (pathname === "/login" || pathname === "/signup")) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (token) {
    if ((pathname === "/admin" || pathname.startsWith("/admin/")) && !token.isAdmin) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  // A path on this site only (never a full URL), so the post-login redirect can't be pointed elsewhere.
  if (pathname !== "/") loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
