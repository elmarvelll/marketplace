// src/app/vendor-dashboard/_components/VendorApprovalGate.tsx
//
// Wraps every tab of the vendor's OWN dashboard (Profile/Products/Sides/
// Orders — see ../[id]/layout.tsx). A vendor that isn't APPROVED yet
// doesn't get the real dashboard — same gating rule as Business's
// BusinessApprovalGate.tsx, but a vendor-owned component reading from the
// vendor's own profile endpoint rather than sharing an instance with
// Business — see
// docs/marketplace/decisions/vendor-independent-architecture.md.

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAxiosError } from "axios";
import { AlertCircle, Ban, Clock, Loader2, XCircle } from "lucide-react";
import api from "@/lib/axios";
import VendorSidebar from "./VendorSidebar";
import { VendorContext } from "./VendorContext";

export interface VendorProfile {
  id: string;
  name: string;
  vendorCategory: string | null;
  description: string;
  location: string | null;
  availabilityStart: string | null;
  availabilityEnd: string | null;
  paused: boolean;
  pausedReason: string | null;
  publicId: string | null;
  secureUrl: string | null;
  bankName: string | null;
  bankCode: string | null;
  accountNumber: string | null;
  accountHolderName: string | null;
  approvalStatus: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "SUSPENDED";
  rejectionReason: string | null;
  blocked?: boolean;
  blockedReason?: string | null;
  createdAt: string;
}

type GateState = "loading" | "approved" | "pending" | "rejected" | "not-found" | "error";

export default function VendorApprovalGate({ id, children }: { id: string; children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("loading");
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setState("loading");
      try {
        const res = await api.get<{ vendor: VendorProfile }>(`/marketplace/vendor/${id}/profile`);
        if (cancelled) return;
        setVendor(res.data.vendor);
        if (res.data.vendor.approvalStatus === "APPROVED") setState("approved");
        else if (res.data.vendor.approvalStatus === "REJECTED") setState("rejected");
        else setState("pending");
      } catch (err) {
        if (cancelled) return;
        const status = isAxiosError(err) ? err.response?.status : undefined;
        if (status === 404 || status === 400) {
          // Mirror of BusinessApprovalGate: if this id is a plain Business
          // the signed-in user owns, send them to its own dashboard instead
          // of a dead end. Owner-scoped endpoint, so nothing is exposed.
          try {
            await api.get(`/marketplace/businesses/${id}`);
            if (!cancelled) router.replace(`/business/${id}`);
            return;
          } catch {
            if (!cancelled) setState("not-found");
            return;
          }
        }
        setState("error");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (state === "loading") {
    return (
      <div className="flex-1 flex justify-center py-24">
        <Loader2 size={28} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (state === "not-found" || state === "error") {
    return (
      <div className="flex-1 flex flex-col items-center text-center py-24">
        <AlertCircle size={28} className="text-gray-500 mb-3" />
        <p className="text-gray-500">
          {state === "not-found" ? "This vendor doesn't exist, or isn't yours." : "Couldn't load this vendor. Please try again."}
        </p>
      </div>
    );
  }

  if (state === "pending") {
    return (
      <div className="flex-1 max-w-lg mx-auto text-center py-24 px-4">
        <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mx-auto mb-5">
          <Clock size={26} />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{vendor?.name} is pending review</h1>
        <p className="text-sm text-gray-500">
          An admin needs to approve this vendor application before its dashboard, products, and orders become
          available. You&apos;ll get an email and a notification once it&apos;s reviewed.
        </p>
      </div>
    );
  }

  if (state === "rejected") {
    return (
      <div className="flex-1 max-w-lg mx-auto text-center py-24 px-4">
        <div className="w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-5">
          <XCircle size={26} />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{vendor?.name} was not approved</h1>
        <p className="text-sm text-gray-500">{vendor?.rejectionReason || "Contact support for more details."}</p>
      </div>
    );
  }

  return (
    <VendorContext.Provider value={vendor}>
      {vendor?.blocked && <BlockedBanner name={vendor.name} reason={vendor.blockedReason} />}
      <div className="flex flex-col sm:flex-row gap-8 flex-1 min-w-0">
        <VendorSidebar id={id} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </VendorContext.Provider>
  );
}

function BlockedBanner({ name, reason }: { name: string; reason: string | null | undefined }) {
  return (
    <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <Ban size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{name} has been blocked by an administrator.</p>
        {reason && <p className="mt-0.5 break-words">Reason: {reason}</p>}
        <p className="mt-1 text-red-700">
          It is hidden from buyers and can&apos;t receive new orders. Orders already paid for still need to be fulfilled. Check your email
          for details on contacting support.
        </p>
      </div>
    </div>
  );
}
