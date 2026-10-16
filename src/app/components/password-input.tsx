// src/app/components/password-input.tsx
//
// Shared password field for the login/signup pages: a Lock-prefixed input
// with a show/hide toggle, styled to match the other icon-prefixed inputs
// on those pages (User, Mail, MapPin) in both dark and light mode.

"use client";

import { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";

interface PasswordInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  isDarkMode: boolean;
  // Signup enforces a minimum length; login doesn't need to (the account
  // already exists with whatever length password it was created with).
  minLength?: number;
}

export function PasswordInput({ value, onChange, placeholder, isDarkMode, minLength }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 ${isDarkMode ? "text-[#737373]" : "text-gray-500"}`} size={20} />
      <input
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required
        minLength={minLength}
        className={`w-full pl-12 pr-11 py-3 border rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-base sm:text-sm ${
          isDarkMode
            ? "bg-[#171717] border-[#525252] text-white placeholder-[#a3a3a3]"
            : "bg-white border-gray-400 text-gray-900 placeholder-gray-500"
        }`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className={`absolute right-4 top-1/2 -translate-y-1/2 ${isDarkMode ? "text-[#737373] hover:text-[#c8c8c8]" : "text-gray-500 hover:text-gray-800"}`}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
