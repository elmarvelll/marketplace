// src/app/components/email-domain-input.tsx
//
// Student email field for sign-up: the person types only the part before the @ and the fixed student domain is shown
// beside it, with the full address previewed underneath. The domain shown here is display only — the server builds
// the address itself (services/auth/register/start-registration.ts), so it can't be changed from the browser.

"use client";

import { Mail } from "lucide-react";

interface EmailDomainInputProps {
  localPart: string;
  onLocalPartChange: (value: string) => void;
  domain: string;
  isDarkMode: boolean;
}

export function EmailDomainInput({ localPart, onLocalPartChange, domain, isDarkMode }: EmailDomainInputProps) {
  const inputClasses = isDarkMode
    ? "bg-[#171717] border-[#262626] text-white placeholder-[#a3a3a3]"
    : "bg-white border-gray-300 text-gray-900 placeholder-gray-500";

  return (
    <div>
      <div className={`flex rounded-2xl border overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition ${inputClasses}`}>
        <div className="relative flex-1 min-w-0">
          <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 ${isDarkMode ? "text-[#a3a3a3]" : "text-gray-500"}`} size={20} />
          <label htmlFor="su-email" className="sr-only">Student email (the part before the @)</label>
          <input
            id="su-email"
            type="text"
            placeholder="Student email"
            value={localPart}
            onChange={(e) => onLocalPartChange(e.target.value)}
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            aria-describedby="su-email-domain"
            className="w-full pl-12 pr-2 py-3 bg-transparent text-gray-900 placeholder-gray-500 focus:outline-none text-base sm:text-sm"
          />
        </div>
        <span
          id="su-email-domain"
          data-testid="email-domain"
          className={`shrink-0 flex items-center border-l px-3 text-base sm:text-sm font-medium select-none ${
            isDarkMode ? "border-[#262626] bg-[#1f1f1f] text-[#e5e5e5]" : "border-gray-300 bg-gray-50 text-gray-900"
          }`}
        >
          @{domain}
        </span>
      </div>
      {localPart.trim() ? (
        <div className={`mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${isDarkMode ? "bg-blue-600/15 text-blue-200" : "bg-blue-50 text-blue-800"}`}>
          <Mail size={15} className="shrink-0" />
          <span className="min-w-0 break-all" data-testid="full-email">{localPart.trim()}@{domain}</span>
        </div>
      ) : (
        <p className={`mt-1.5 text-xs ${isDarkMode ? "text-[#a3a3a3]" : "text-gray-600"}`}>Type the part before the @ of your student email.</p>
      )}
    </div>
  );
}
