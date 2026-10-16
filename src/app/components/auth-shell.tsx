// src/app/components/auth-shell.tsx
//
// The frame shared by the auth pages (the "create your account on AkadVerse" page): brand, a titled card, and a
// footer slot for the "other" action. Server-renderable; the forms inside are client components.

import Link from "next/link";
import { ShoppingBag } from "lucide-react";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-10">
      <Link href="/login" className="mb-6 flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-blue-600">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white" aria-hidden>
          <ShoppingBag size={20} />
        </span>
        <span className="text-lg font-bold text-gray-900">AkadVerse Marketplace</span>
      </Link>
      <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-5 text-sm text-gray-600">{footer}</div>}
    </main>
  );
}

export const authInputClass =
  "w-full rounded-2xl border border-gray-400 bg-white px-4 py-3 text-base sm:text-sm text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60";
export const authButtonClass =
  "flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
