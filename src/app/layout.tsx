// src/app/layout.tsx — root layout of the standalone Marketplace.

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppNotifications } from "./_components/AppNotifications";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "AkadVerse Marketplace", template: "%s · AkadVerse Marketplace" },
  description: "Buy from and sell to fellow students: campus businesses, school vendors, and delivery.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>
          <AppNotifications>{children}</AppNotifications>
        </Providers>
      </body>
    </html>
  );
}
