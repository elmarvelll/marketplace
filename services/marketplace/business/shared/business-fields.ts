// services/marketplace/business/shared/business-fields.ts
//
// Field parsing/validation shared by create-business.ts and
// update-business.ts — the only two actions in this domain that accept a
// BusinessFormValues body.

import { badRequest } from "@/lib/service-error";
import type { BusinessFormValues, DeliveryDay } from "@/types/business";
import { MAX_DELIVERY_DAYS } from "@/types/business";

const VALID_DAYS: DeliveryDay[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

export function sanitizeDeliveryDays(days: DeliveryDay[] | undefined): DeliveryDay[] {
  const deliveryDays = (days ?? []).filter((day, index, arr) => VALID_DAYS.includes(day) && arr.indexOf(day) === index);
  if (deliveryDays.length > MAX_DELIVERY_DAYS) {
    throw badRequest(`You can select at most ${MAX_DELIVERY_DAYS} delivery days.`);
  }
  return deliveryDays;
}

export function requireCoreBusinessFields(data: Partial<BusinessFormValues>) {
  const name = data.name?.trim();
  const industry = data.industry?.trim();
  const description = data.description?.trim();
  if (!name || !industry || !description) {
    throw badRequest("Business name, category, and description are required.");
  }
  return { name, industry, description };
}
