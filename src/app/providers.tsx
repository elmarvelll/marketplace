// src/app/providers.tsx
//
// NextAuth's `useSession()` hook and `signIn()`/`signOut()` helpers (used on
// the login/signup pages) rely on React context provided by
// `<SessionProvider>`. That provider must wrap the whole app, and — because
// it uses context/hooks internally — must live in a Client Component.
//
// The root layout (src/app/layout.tsx) is a Server Component, so we can't
// put "use client" there without turning the entire app client-side. This
// small wrapper is the standard pattern: layout.tsx stays a Server
// Component and just renders <Providers>{children}</Providers>.

"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
