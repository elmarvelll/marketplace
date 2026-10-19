// services/marketplace/vendor-checkout/create-vendor-orders-for-checkout.ts
//
// Creates the real, payment-pending vendor Orders (+ their OrderItems) and
// the one VendorDeliveryBooking that covers them — sibling to, and
// deliberately never modifying, services/marketplace/checkout/create-orders-for-checkout.ts
// (see docs/marketplace/decisions/vendor-extends-business.md). Called by
// src/app/api/marketplace/vendor-checkout/initialize/route.controller.ts.
//
// Concurrency: runs at Postgres SERIALIZABLE isolation, not just wrapped in
// an ordinary transaction — each vendor's own per-timeframe order
// capacity (VendorTimeframeCapacity) and item stock are both
// aggregate/multi-row checks (a COUNT and a stock re-read), which a plain
// READ COMMITTED transaction does not protect against two concurrent
// checkouts both passing the same check and then both writing (write
// skew). SERIALIZABLE makes Postgres abort one of two conflicting
// transactions with a serialization failure instead — caught below and
// surfaced as a plain "try again" conflict, never a duplicate/oversold
// booking. Nothing is reserved just because it's in the cart (see
// get-vendor-cart-for-user.ts) — this transaction is the only place
// stock/capacity are actually committed, and only once, right here.
//
// Vendor capacity vs. deliverer-roster capacity: this file only ever
// checks/consumes a vendor's OWN VendorTimeframeCapacity. It never reads
// VendorDeliverySlot.delivererCapacity — that's the admin-configured
// deliverer-roster system (DelivererRosterAssignment), a completely
// separate concern that must never gate a customer's booking. See
// docs/marketplace/decisions/vendor-independent-architecture.md.
//
// Delivery roster limit: separately, the Vendor Market delivery roster
// (services/marketplace/delivery-roster/) may cap how many DELIVERIES (one
// per booking) a timeframe takes on a date, or close it for a date. That is
// an operation-wide limit an admin sets — not deliverer positions — and it
// is checked here, in the same Serializable transaction, on top of each
// vendor's own capacity. Unset (the default), it changes nothing. The
// booking's ScheduledDelivery row records the roster's planned deliverer.

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { conflict, badRequest } from "@/lib/service-error";
import { getVendorCartForUser } from "@/services/marketplace/vendor-cart/get-vendor-cart-for-user";
import { getMarketplaceSettings } from "@/services/marketplace/admin/shared/marketplace-settings";
import { isSlotBookable } from "@/services/marketplace/vendor-delivery/is-slot-bookable";
import { parseAndValidateDeliveryDate } from "@/services/marketplace/vendor-delivery/validate-delivery-date";
import { calculateVendorFees } from "./shared/vendor-fees";
import { resolveVendorCapacity } from "@/services/marketplace/vendor/capacity/resolve-vendor-capacity";
import { countVendorBookingsForSlot } from "@/services/marketplace/vendor/capacity/manage-vendor-capacity";
import { EmptyCartError } from "@/services/marketplace/checkout/shared/empty-cart-error";
import { reserveLine } from "@/services/marketplace/checkout/shared/stock-reservation";
import { CHECKOUT_CURRENCY, reservationExpiry, toKobo } from "@/services/marketplace/checkout/shared/checkout-payment-config";
import { resolveOccurrence } from "@/services/marketplace/delivery-roster/roster-resolution";
import { countReservedDeliveries } from "@/services/marketplace/delivery-roster/roster-capacity";
import { createScheduledDelivery } from "@/services/marketplace/delivery-roster/delivery-plans";

export { EmptyCartError };

const MAX_SERIALIZATION_RETRIES = 2;

export async function createVendorOrdersForCheckout(userId: string, params: { slotId: string; location: string; date?: string }) {
  const slotId = params.slotId?.trim();
  if (!slotId) throw badRequest("slotId is required.");

  const cartItems = await getVendorCartForUser(userId);
  if (cartItems.length === 0) throw new EmptyCartError("Your Vendor cart is empty.");

  const settings = await getMarketplaceSettings();
  const reference = `AKD-VEND-${Date.now()}-${randomUUID().slice(0, 8)}`;
  // Never trusts the client's date blindly — re-validated here as the
  // actual point of no return, same as every other value re-checked inside
  // this transaction (spec §6/§28).
  const bookedFor = parseAndValidateDeliveryDate(params.date);

  let attempt = 0;
  for (;;) {
    try {
      return await runBookingTransaction();
    } catch (err) {
      // P2034: Prisma's code for a serialization failure / deadlock under
      // an explicit isolation level — safe to retry from scratch since
      // nothing committed. Anything else (including our own `conflict`
      // throws for real business-rule failures) propagates immediately.
      const isSerializationFailure = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (isSerializationFailure && attempt < MAX_SERIALIZATION_RETRIES) {
        attempt += 1;
        continue;
      }
      if (isSerializationFailure) {
        throw conflict("This delivery slot just filled up — please try again.");
      }
      throw err;
    }
  }

  async function runBookingTransaction() {
    return prisma.$transaction(
      async (tx) => {
        const slot = await tx.vendorDeliverySlot.findUnique({ where: { id: slotId } });
        if (!slot || !slot.active) throw conflict("Selected delivery slot is not available.");
        if (!isSlotBookable(slot, new Date(), bookedFor)) throw conflict("This delivery slot can no longer be booked — please pick another.");

        // The Vendor Market delivery roster's own limit for this occurrence
        // (see the header) — closed dates and a full delivery limit refuse
        // the booking before anything is reserved.
        const occurrence = await resolveOccurrence("VENDOR", slot.id, bookedFor, tx);
        if (occurrence.closed) throw conflict("This delivery time isn't available on that date — please pick another.");
        if (occurrence.limit !== null && (await countReservedDeliveries("VENDOR", slot.id, bookedFor, tx)) >= occurrence.limit) {
          throw conflict("This delivery time is fully booked for that date — please pick another.");
        }

        // Note: slot.delivererCapacity is NOT checked here — it's the
        // admin-configured deliverer-roster capacity (a completely
        // separate system, see DelivererRosterAssignment), never a gate on
        // customer bookings. Each vendor's OWN order-fulfillment capacity
        // for this slot (VendorTimeframeCapacity) is checked per-business
        // below, once we know which vendors are actually in this cart —
        // see docs/marketplace/decisions/vendor-independent-architecture.md.

        // Re-verify stock AND price for every line inside the transaction
        // — never trust the cart snapshot's price at booking time (spec:
        // "Checkout must revalidate prices against the database before
        // booking"). Reads are batched into 3 bulk queries (one per entity
        // type) instead of one findUnique per cart item — a transaction
        // holds a single pooled connection for its entire duration, so N
        // sequential round trips here directly extends how long that one
        // connection is unavailable to every other concurrent request
        // (this was the dominant cost behind slow vendor-checkout calls
        // and the pool contention they caused elsewhere — see
        // docs/marketplace/decisions/notification-poll-connection-safety.md).
        // Decrements remain one `update` per item (each decrements a
        // different amount, and this is the actual write/lock point
        // Serializable isolation needs to see individually) — identical
        // validation logic and outcomes to before, just fewer round trips
        // to get there.
        const sideIds = cartItems.filter((i) => i.kind === "side").map((i) => i.sideId!);
        const variantIds = cartItems.filter((i) => i.kind === "product" && i.variantId).map((i) => i.variantId!);
        const productIds = cartItems.filter((i) => i.kind === "product" && !i.variantId).map((i) => i.productId!);

        // Sequential, not Promise.all: an interactive transaction (`tx`
        // above) shares exactly one connection/session, so concurrently
        // dispatched queries on it don't run in parallel anyway (Prisma
        // queues them) and risk-wise it's the pattern Prisma's own docs
        // treat as safe for interactive transactions — this still
        // collapses N per-item queries down to 3 bulk ones, which is
        // where the actual round-trip savings comes from.
        const sides =
          sideIds.length > 0
            ? await tx.side.findMany({ where: { id: { in: sideIds } }, select: { id: true, available: true, stock: true, price: true } })
            : [];
        const variants =
          variantIds.length > 0
            ? await tx.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, stock: true, price: true } })
            : [];
        const products =
          productIds.length > 0
            ? await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, stock: true, price: true } })
            : [];
        const sideById = new Map(sides.map((s) => [s.id, s]));
        const variantById = new Map(variants.map((v) => [v.id, v]));
        const productById = new Map(products.map((p) => [p.id, p]));

        // Stock is RESERVED here (conditional decrement — see
        // checkout/shared/stock-reservation.ts) and released exactly once if
        // this checkout is cancelled, fails, or expires
        // (checkout/release-checkout-reservation.ts). Same rule as the
        // Business checkout, through the same helper.
        const revalidatedPrices = new Map<string, number>();
        for (const item of cartItems) {
          if (!Number.isInteger(item.quantity) || item.quantity < 1) throw conflict(`${item.name} has an invalid quantity.`);
          let price: number;
          if (item.kind === "side") {
            const side = sideById.get(item.sideId!);
            if (!side || !side.available) throw conflict(`${item.name} is no longer available.`);
            price = side.price;
          } else if (item.variantId) {
            const variant = variantById.get(item.variantId);
            if (!variant) throw conflict(`${item.name}${item.variantName ? ` (${item.variantName})` : ""} is no longer available.`);
            price = variant.price;
          } else {
            const product = productById.get(item.productId!);
            if (!product) throw conflict(`${item.name} is no longer available.`);
            price = product.price;
          }
          const reserved = await reserveLine(tx, {
            productId: item.kind === "side" ? null : (item.productId ?? null),
            variantId: item.kind === "side" ? null : (item.variantId ?? null),
            sideId: item.kind === "side" ? item.sideId! : null,
            quantity: item.quantity,
          });
          if (!reserved) throw conflict(`${item.name}${item.variantName ? ` (${item.variantName})` : ""} no longer has enough stock.`);
          revalidatedPrices.set(item.id, price);
        }
        // Fee calculation, grouping, and every downstream total use the
        // revalidated prices, not the (possibly stale) cart snapshot.
        const pricedItems = cartItems.map((item) => ({ ...item, price: revalidatedPrices.get(item.id) ?? item.price }));

        const byBusiness = new Map<string, typeof pricedItems>();
        for (const item of pricedItems) {
          byBusiness.set(item.businessId, [...(byBusiness.get(item.businessId) ?? []), item]);
        }

        // Every business represented must still be an approved, non-paused
        // vendor — re-checked here as the actual point of no return, same
        // as create-orders-for-checkout.ts's business recheck. One bulk
        // query instead of one findUnique per distinct business.
        const businesses = await tx.business.findMany({
          where: { id: { in: Array.from(byBusiness.keys()) } },
          select: { id: true, approvalStatus: true, type: true, paused: true, blocked: true, name: true },
        });
        const businessById = new Map(businesses.map((b) => [b.id, b]));

        for (const businessId of byBusiness.keys()) {
          const business = businessById.get(businessId);
          if (!business || business.type !== "SCHOOL_VENDOR" || business.approvalStatus !== "APPROVED") {
            throw conflict("One of the vendors in your cart is no longer available.");
          }
          // Paused (vendor's own toggle) or admin-blocked: no new bookings.
          if (business.paused || business.blocked) throw conflict(`${business.name} isn't currently accepting orders.`);

          // Vendor's own per-timeframe, per-DATE order capacity (spec
          // §4-7) — a completely independent check from
          // slot.delivererCapacity above. resolveVendorCapacity checks a
          // VendorTimeframeCapacityOverride for this exact bookedFor date
          // first, falling back to the vendor's default
          // VendorTimeframeCapacity row, else 0 (never configured this
          // timeframe at all). Counted (not decremented) inside this same
          // Serializable transaction, so "resolve capacity, count, then
          // create" is atomic against a concurrent checkout for the same
          // vendor+slot+date — two customers can't both consume the last
          // unit of capacity, and a booking for one date can never consume
          // another date's capacity.
          const capacity = await resolveVendorCapacity(businessId, slot.id, bookedFor, tx);
          const alreadyBooked = await countVendorBookingsForSlot(businessId, slot.id, bookedFor, tx);
          if (alreadyBooked >= capacity) {
            throw conflict(`${business.name} is fully booked for this delivery time — please pick another vendor or time.`);
          }
        }

        const fees = calculateVendorFees(pricedItems, settings);

        const booking = await tx.vendorDeliveryBooking.create({
          data: { userId, slotId: slot.id, paystackReference: reference, deliveryFee: fees.deliveryFee, serviceFee: fees.serviceFee, status: "PENDING_PAYMENT", bookedFor },
        });

        await createScheduledDelivery(tx, { operation: "VENDOR", bookingId: booking.id, slotId: slot.id, date: bookedFor, staff: occurrence.staff });

        const orders = [];
        for (const [businessId, items] of byBusiness) {
          const order = await tx.order.create({
            data: {
              userId,
              businessId,
              status: "PENDING_SELLER",
              paymentStatus: "pending",
              paystackReference: reference,
              deliveryLocation: params.location || null,
              vendorDeliveryBookingId: booking.id,
              totalAmount: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
              items: {
                create: items.map((item) => ({
                  productId: item.productId,
                  sideId: item.sideId,
                  variantId: item.variantId,
                  variantName: item.variantName,
                  quantity: item.quantity,
                  price: item.price,
                })),
              },
            },
          });
          orders.push(order);
        }

        const amountKobo = toKobo(fees.total);
        if (amountKobo <= 0) throw conflict("This order has nothing to pay for.");
        // The payment attempt — see CheckoutPayment in prisma/schema.prisma.
        // The Orders above stay hidden "pending" rows, and the booking stays
        // PENDING_PAYMENT, until Paystack confirms this exact amount.
        await tx.checkoutPayment.create({
          data: {
            reference,
            userId,
            kind: "VENDOR",
            amountKobo,
            currency: CHECKOUT_CURRENCY,
            cartItemIds: cartItems.map((item) => item.id),
            expiresAt: reservationExpiry(),
          },
        });

        return { reference, totalAmount: fees.total, amountKobo, orderIds: orders.map((o) => o.id), bookingId: booking.id };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        // Prisma's interactive-transaction defaults (maxWait: 2000ms to
        // acquire a connection, timeout: 5000ms for the whole callback)
        // are tuned for a local/co-located DB. Against a remote DB this
        // transaction's own round trips (now batched, but still several)
        // can legitimately exceed 5s under real network latency, and
        // Prisma kills the transaction outright with P2028 ("Transaction
        // already closed") when that budget runs out — a false failure of
        // an otherwise-healthy transaction, not a sign anything is wrong.
        // Raised to give it realistic headroom; still well short of
        // "unbounded," so a genuinely stuck transaction still fails
        // rather than holding its connection forever.
        maxWait: 10000,
        timeout: 15000,
      }
    );
  }
}
