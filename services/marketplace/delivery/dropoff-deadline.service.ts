// services/marketplace/delivery/dropoff-deadline.service.ts
//
// The seller's central drop-off deadline: 15 hours before the start of the
// new day of the estimated delivery date — i.e. 15 hours before 12:00 AM on
// the estimated delivery date, NOT "15 hours before the delivery window
// itself." See docs/marketplace/decisions/seller-dropoff-deadline.md for
// why this reference point was chosen.
//
// Example: estimated delivery Wednesday -> the start of that new day is
// Wednesday 12:00 AM -> the deadline is Tuesday 9:00 PM.

const DEADLINE_HOURS_BEFORE_MIDNIGHT = 15;

export function getSellerDropoffDeadline(estimatedDeliveryAt: Date): Date {
  const startOfDeliveryDay = new Date(estimatedDeliveryAt);
  startOfDeliveryDay.setHours(0, 0, 0, 0);
  return new Date(startOfDeliveryDay.getTime() - DEADLINE_HOURS_BEFORE_MIDNIGHT * 60 * 60 * 1000);
}

export function hasMissedDropoffDeadline(estimatedDeliveryAt: Date, droppedOffAt: Date | null, now: Date = new Date()): boolean {
  const deadline = getSellerDropoffDeadline(estimatedDeliveryAt);
  const checkAgainst = droppedOffAt ?? now;
  return checkAgainst.getTime() > deadline.getTime();
}
