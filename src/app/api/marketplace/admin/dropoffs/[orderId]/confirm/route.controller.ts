// .../admin/dropoffs/[orderId]/confirm/route.controller.ts
//
// Controller for POST .../admin/dropoffs/[orderId]/confirm. See
// services/marketplace/delivery/confirm-seller-dropoff.ts.

import { NextRequest, NextResponse } from "next/server";
import { runController, readJsonBody } from "@/lib/controller-helpers";
import { requireAdmin } from "@/lib/admin";
import { badRequest } from "@/lib/service-error";
import { confirmSellerDropoff as confirmSellerDropoffAction } from "@/services/marketplace/delivery/confirm-seller-dropoff";

export async function confirmSellerDropoff(request: NextRequest, orderId: string): Promise<NextResponse> {
  return runController(async () => {
    const admin = await requireAdmin();
    const body = await readJsonBody<{ otp?: string }>(request);
    const otp = body.otp?.trim();
    if (!otp) throw badRequest("otp is required.");
    const result = await confirmSellerDropoffAction(orderId, otp, admin.user.id);
    return NextResponse.json({ message: "Order received from seller.", ...result });
  });
}
