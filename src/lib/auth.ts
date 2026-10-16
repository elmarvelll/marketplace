// src/lib/auth.ts
//
// Authentication for the standalone Marketplace (NextAuth v4, JWT sessions) — sessions entirely separate from
// AkadVerse's:
//   - its own NEXTAUTH_SECRET, so an AkadVerse session token is not valid here (and vice versa);
//   - its own cookie names ("mkt.*"), so the two apps never read or overwrite each other's cookies even on one host;
//   - HttpOnly, SameSite=Lax cookies, Secure in production; NextAuth's built-in CSRF token protects sign-in/sign-out.
//
// Identity is AkadVerse's. Every Marketplace account is an existing AkadVerse User row (same id) — the Marketplace
// never creates accounts, stores passwords, or changes an AkadVerse login. Two ways in:
//   1. AkadVerse email + password — bcrypt check against that User row (src/lib/akadverse-identity.ts).
//   2. Google (optional) — Google-verified email that matches an existing AkadVerse account.
// No AkadVerse account yet? The sign-in page links to AkadVerse's sign-up (NEXT_PUBLIC_AKADVERSE_URL).
//
// A session is a signed JWT, so on its own it can't be revoked. Every protected request therefore goes through
// src/lib/session.ts#getActiveSession, which re-checks the account, its Marketplace block and its session version.

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/account-domains";
import { MARKETPLACE_ROLE, verifyAkadverseCredentials } from "@/lib/akadverse-identity";
import { getAccountState, toAccountState } from "@/lib/account-state";
import { clearAttempts, clientIp, consumeAttempt, LOGIN_RULE_PER_EMAIL, LOGIN_RULE_PER_IP } from "@/lib/throttle";
import { ServiceError } from "@/lib/service-error";

const isProduction = process.env.NODE_ENV === "production";
const cookiePrefix = isProduction ? "__Secure-" : "";
const baseCookie = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: isProduction };

// Error codes surfaced to the login page (NextAuth passes a thrown Error's message through as `error`).
export const LOGIN_ERRORS = {
  blocked: "AccountBlocked",
  throttled: "TooManyAttempts",
  notEligible: "NotEligible",
  noAccount: "NoAkadverseAccount",
} as const;

// The credential check, separated from NextAuth so it can be tested directly. Returns the AkadVerse user, null for
// "wrong email or password" (deliberately indistinguishable), or throws an Error whose message is a LOGIN_ERRORS code.
export async function authenticateWithPassword(rawEmail: unknown, rawPassword: unknown, ip: string) {
  const email = normalizeEmail(rawEmail);
  const password = typeof rawPassword === "string" ? rawPassword : "";
  if (!email || !password || password.length > 200) return null;

  const emailKey = `login:email:${email}`;
  try {
    await consumeAttempt(`login:ip:${ip}`, LOGIN_RULE_PER_IP);
    await consumeAttempt(emailKey, LOGIN_RULE_PER_EMAIL);
  } catch (err) {
    if (err instanceof ServiceError && err.status === 429) throw new Error(LOGIN_ERRORS.throttled);
    throw err;
  }

  const verified = await verifyAkadverseCredentials(email, password);
  if (verified.status === "invalid") return null;
  if (verified.status === "not_eligible") throw new Error(LOGIN_ERRORS.notEligible);

  if ((await getAccountState(verified.account.id)).blocked) throw new Error(LOGIN_ERRORS.blocked);
  await clearAttempts(emailKey);
  return verified.account;
}

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// Google sign-in: only for an existing AkadVerse account with the same (Google-verified) email.
export async function googleSignInDecision(rawEmail: unknown, emailVerified: boolean | undefined): Promise<true | string> {
  const email = normalizeEmail(rawEmail);
  if (!email || emailVerified === false) return "/login?error=GoogleUnverified";
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, marketplaceAccount: { select: { blocked: true } } } });
  if (!user) return `/login?error=${LOGIN_ERRORS.noAccount}`;
  if (user.role !== MARKETPLACE_ROLE) return `/login?error=${LOGIN_ERRORS.notEligible}`;
  if (user.marketplaceAccount?.blocked) return `/login?error=${LOGIN_ERRORS.blocked}`;
  return true;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60,
  },

  cookies: {
    sessionToken: { name: `${cookiePrefix}mkt.session-token`, options: baseCookie },
    callbackUrl: { name: `${cookiePrefix}mkt.callback-url`, options: { ...baseCookie, httpOnly: false } },
    // __Host- requires Secure and no Domain: the CSRF cookie can't be set from a sibling subdomain.
    csrfToken: { name: `${isProduction ? "__Host-" : ""}mkt.csrf-token`, options: baseCookie },
    pkceCodeVerifier: { name: `${cookiePrefix}mkt.pkce.code_verifier`, options: { ...baseCookie, maxAge: 900 } },
    state: { name: `${cookiePrefix}mkt.state`, options: { ...baseCookie, maxAge: 900 } },
    nonce: { name: `${cookiePrefix}mkt.nonce`, options: baseCookie },
  },

  pages: { signIn: "/login", error: "/login" },

  providers: [
    CredentialsProvider({
      name: "AkadVerse email and password",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(credentials, req) {
        const user = await authenticateWithPassword(credentials?.email, credentials?.password, clientIp(req?.headers as Record<string, string> | undefined));
        return user ? { id: user.id, email: user.email, name: `${user.firstName} ${user.lastName}` } : null;
      },
    }),
    ...(googleConfigured ? [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! })] : []),
  ],

  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      return googleSignInDecision(user.email, (profile as { email_verified?: boolean } | undefined)?.email_verified);
    },

    async jwt({ token, user }) {
      // `user` is only present at sign-in: load the AkadVerse account once and pin its Marketplace session version.
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: normalizeEmail(user.email) },
          select: { id: true, email: true, firstName: true, lastName: true, isAdmin: true, marketplaceAccount: { select: { sessionVersion: true } } },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.email = dbUser.email;
          token.name = `${dbUser.firstName} ${dbUser.lastName}`;
          token.firstName = dbUser.firstName;
          token.isAdmin = dbUser.isAdmin;
          token.sv = toAccountState(dbUser.marketplaceAccount).sessionVersion;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.firstName = token.firstName;
        session.user.isAdmin = Boolean(token.isAdmin);
      }
      return session;
    },

    // Only same-origin redirects after sign-in/out — never an attacker-supplied external URL.
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/") && !url.startsWith("//")) return `${baseUrl}${url}`;
      try {
        if (new URL(url).origin === baseUrl) return url;
      } catch {
        /* not a URL */
      }
      return baseUrl;
    },
  },
};
