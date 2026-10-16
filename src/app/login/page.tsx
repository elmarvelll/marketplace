// src/app/login/page.tsx
import { LoginPageShell } from "./LoginPageShell";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return <LoginPageShell googleEnabled={googleEnabled} />;
}
