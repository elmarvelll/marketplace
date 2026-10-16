// src/app/_components/MarketplaceFooter.tsx
//
// Footer link cycles through the deliverer application lifecycle — see
// services/marketplace/deliverer/deliverer.service.ts and docs/marketplace/systems/deliverer-system.md:
//   not applied  -> "Become a Deliverer"      -> /deliverer/apply
//   pending      -> "Deliverer Application Pending" (no link)
//   approved     -> "Delivery Dashboard"       -> /deliverer
//   rejected     -> "Become a Deliverer" again (a rejected applicant isn't
//                    permanently blocked from reapplying — see
//                    docs/marketplace/decisions/rejected-deliverer-can-reapply.md)
//   suspended    -> "Deliverer Access Suspended" (no link)

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import api from "@/lib/axios";

type DelivererFooterKind = "not_applied" | "pending" | "approved" | "rejected" | "suspended";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";

export default function MarketplaceFooter() {
  const [state, setState] = useState<DelivererFooterKind>("not_applied");

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ state: { kind: DelivererFooterKind } }>("/marketplace/deliverer/status")
      .then((res) => {
        if (!cancelled) setState(res.data.state.kind);
      })
      .catch(() => {
        // Leave the default "not_applied" state on failure — worst case the
        // footer briefly offers "Become a Deliverer" to someone who's
        // already applied, which the apply route itself still guards
        // against (409 on a duplicate application).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="border-t border-gray-100 mt-16 px-4 sm:px-6 py-8">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} Deltvolve Inc. All rights reserved.</p>
        <div className="flex items-center gap-5">
          <DelivererLink state={state} />
          <Link href="/vendor/apply" className="hover:text-gray-900 transition">
            Become a Vendor
          </Link>
          {/* Support address comes from configuration (NEXT_PUBLIC_SUPPORT_EMAIL); AkadVerse hardcoded a personal address here. */}
          {SUPPORT_EMAIL && (
            <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-1.5 hover:text-gray-900 transition">
              <Mail size={14} />
              {SUPPORT_EMAIL}
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}

function DelivererLink({ state }: { state: DelivererFooterKind }) {
  switch (state) {
    case "pending":
      return <span className="text-gray-500">Deliverer Application Pending</span>;
    case "approved":
      return (
        <Link href="/deliverer" className="hover:text-gray-900 transition">
          Delivery Dashboard
        </Link>
      );
    case "suspended":
      return <span className="text-gray-500">Deliverer Access Suspended</span>;
    case "not_applied":
    case "rejected":
    default:
      return (
        <Link href="/deliverer/apply" className="hover:text-gray-900 transition">
          Become a Deliverer
        </Link>
      );
  }
}
