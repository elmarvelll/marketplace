"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, Mail } from "lucide-react";
import { PasswordInput } from "../components/password-input";

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "That email or password isn't right.",
  AccountBlocked: "This account has been blocked. Contact support if you believe this is a mistake.",
  TooManyAttempts: "Too many sign-in attempts. Please wait about 15 minutes and try again.",
  NotEligible: "The Marketplace is for student accounts. This AkadVerse account isn't a student account.",
  GoogleUnverified: "Your Google email address isn't verified.",
  NoAkadverseAccount: "There's no AkadVerse account with that Google email. Create your account on AkadVerse first.",
  OAuthAccountNotLinked: "That email is already registered. Sign in with your password instead.",
};

export function safeCallbackPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.startsWith("/api/")) return "/";
  return value;
}

export function LoginForm({ googleEnabled, isDarkMode }: { googleEnabled: boolean; isDarkMode: boolean }) {
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackPath(searchParams.get("callbackUrl"));
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(urlError ? (ERROR_MESSAGES[urlError] ?? "We couldn't sign you in. Please try again.") : "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await signIn("credentials", { email: email.trim(), password, redirect: false, callbackUrl });
    if (result?.ok && !result.error) {
      window.location.assign(callbackUrl);
      return;
    }
    setError(ERROR_MESSAGES[result?.error ?? ""] ?? "We couldn't sign you in. Please try again.");
    setBusy(false);
  };

  const inputClass = isDarkMode
    ? "bg-[#171717] border-[#525252] text-white placeholder-[#a3a3a3]"
    : "bg-white border-gray-400 text-gray-900 placeholder-gray-500";

  const buttonClass = isDarkMode
    ? "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
    : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white";

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <label htmlFor="login-email" className={`mb-1.5 block text-xs font-semibold ${isDarkMode ? "text-[#d4d4d4]" : "text-gray-800"}`}>Email</label>
        <div className="relative">
          <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 ${isDarkMode ? "text-[#a3a3a3]" : "text-gray-500"}`} size={20} aria-hidden />
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            className={`w-full pl-12 pr-3 py-3 border rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-base sm:text-sm ${inputClass}`}
          />
        </div>
      </div>

      <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" isDarkMode={isDarkMode} />

      {error && <p role="alert" className={`rounded-lg p-3 text-sm ${isDarkMode ? "text-red-300 bg-red-900/20" : "text-red-700 bg-red-100"}`}>{error}</p>}

      <button type="submit" disabled={busy || !email.trim() || !password} className={`w-full py-3 rounded-full font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed mt-2 ${buttonClass}`}>
        {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {busy ? "Signing in…" : "Log In"}
      </button>

      <div className="flex items-center gap-3 py-1">
        <div className={`flex-1 h-px ${isDarkMode ? "bg-white/10" : "bg-gray-200"}`} />
        <span className={`text-xs ${isDarkMode ? "text-[#a3a3a3]" : "text-gray-600"}`}>or</span>
        <div className={`flex-1 h-px ${isDarkMode ? "bg-white/10" : "bg-gray-200"}`} />
      </div>

      {googleEnabled && (
        <button
          type="button"
          disabled={busy}
          onClick={() => signIn("google", { callbackUrl })}
          className={`w-full py-3 border rounded-full font-semibold text-sm flex items-center justify-center gap-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed ${
            isDarkMode ? "bg-[#171717] border-[#525252] text-white hover:bg-[#1f1f1f]" : "bg-white border-gray-400 text-gray-900 hover:bg-gray-50"
          }`}
        >
          <GoogleMark /> Continue with Google
        </button>
      )}

      <p className={`rounded-xl p-3 text-xs ${isDarkMode ? "bg-blue-600/10 text-blue-200" : "bg-blue-50 text-blue-900"}`}>
        Sign in with your AkadVerse email and password. Your account, password and details are managed by AkadVerse; the Marketplace never stores or changes your password.
      </p>

      <p className={`text-sm text-center pt-1 ${isDarkMode ? "text-[#9CA3AF]" : "text-gray-600"}`}>
        Don&apos;t have an account?{" "}
        <Link href="/signup" className={`font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          Create one on AkadVerse
        </Link>
      </p>
    </form>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.9 19 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4c-7.4 0-13.8 4.2-17.7 10.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C10.1 39.7 16.5 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.6 36.4 44 30.7 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}
