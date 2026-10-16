// src/app/signup/page.tsx
//
// The Marketplace doesn't create accounts: every Marketplace user is an AkadVerse account, created by AkadVerse's own
// sign-up (which also does the academic checks). This page sends people there. NEXT_PUBLIC_AKADVERSE_URL is
// AkadVerse's public origin.

import Link from "next/link";
import { AuthShell, authButtonClass } from "../components/auth-shell";

export const metadata = { title: "Create an account" };

export default function SignupPage() {
  const akadverse = process.env.NEXT_PUBLIC_AKADVERSE_URL?.replace(/\/+$/, "");
  return (
    <AuthShell
      title="Create your account on AkadVerse"
      subtitle="The Marketplace uses your AkadVerse account. Sign up on AkadVerse, then sign in here with the same email and password."
      footer={
        <>
          Already have an AkadVerse account?{" "}
          <Link href="/login" className="font-semibold text-gray-900">
            Sign in
          </Link>
        </>
      }
    >
      {akadverse ? (
        <a href={`${akadverse}/signup`} className={authButtonClass} rel="noopener">
          Go to AkadVerse sign-up
        </a>
      ) : (
        <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">Create your account on AkadVerse, then come back here to sign in.</p>
      )}
      <p className="mt-4 text-xs text-gray-500">Can&apos;t sign in? Your password belongs to your AkadVerse account and can&apos;t be changed here — contact AkadVerse support.</p>
    </AuthShell>
  );
}
