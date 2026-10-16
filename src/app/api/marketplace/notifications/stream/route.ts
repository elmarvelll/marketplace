// src/app/api/marketplace/notifications/stream/route.ts
//
// GET -> one Server-Sent-Events connection for the signed-in user. This is
// the ONLY SSE endpoint in the app — src/app/_components/NotificationProvider.tsx
// opens exactly one EventSource to it per session and shares the result
// with every marketplace component (bell, dropdown, etc) via context.
//
// Delivery is two-layered: the in-process broadcaster
// (services/marketplace/notifications/sse-broadcaster.ts) pushes
// immediately when a notification is created on THIS server instance; a
// short interval poll (every 5s) inside this same connection also checks
// the DB directly, so a notification created by a request handled on a
// different instance still arrives within a few seconds. The database
// stays the single source of truth either way (see
// services/marketplace/notifications/notification.service.ts) — SSE only
// ever communicates that something changed.
//
// Idempotency: both paths funnel through the same send() below, which is
// the single gate that decides whether a notification actually goes out
// over the wire. It's keyed on Notification.id — not on the poll's
// createdAt cursor alone, since two notifications can share a timestamp —
// so if the broadcaster already delivered id X the instant it was
// created, the poll finding that same row moments later is a no-op, and
// vice versa. sentIds is capped so a long-lived connection doesn't grow
// this set forever.
//
// Node runtime (not edge): needs Prisma and the session helper, neither of
// which run on the edge runtime.

import { NextRequest } from "next/server";
import { getActiveSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { subscribe } from "@/services/marketplace/notifications/sse-broadcaster";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The in-process broadcaster (sse-broadcaster.ts) is the primary delivery
// path and pushes instantly for a notification created on this server
// instance — this poll only exists as a fallback to catch one created on a
// *different* instance. A fallback doesn't need sub-5-second responsiveness,
// and every open connection runs this query on its own timer regardless of
// whether anything changed, so 5s was needlessly aggressive DB load for
// what's meant to be a rare-case safety net, not the primary mechanism —
// see docs/marketplace/decisions/notification-poll-connection-safety.md.
// Delivery semantics are unchanged: same eventual-delivery guarantee, same
// dedup, just a longer worst-case delay for the fallback path specifically.
const POLL_INTERVAL_MS = 20000;
const HEARTBEAT_INTERVAL_MS = 20000;
// Comfortably more than any realistic burst between polls — this is a
// dedup window, not a hard cap on throughput.
const MAX_TRACKED_IDS = 500;

interface NotificationPayload {
  id: string;
  scope: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  orderId: string | null;
  businessId: string | null;
  createdAt: string;
}

export async function GET(request: NextRequest) {
  const session = await getActiveSession();
  if (!session?.user?.id) {
    return new Response("Not signed in.", { status: 401 });
  }
  const userId = session.user.id;

  const encoder = new TextEncoder();
  let closed = false;
  let lastSeenAt = new Date();
  // Insertion-ordered, so trimming the oldest entries when over
  // MAX_TRACKED_IDS is a simple "delete the first N keys".
  const sentIds = new Set<string>();
  // Declared in this shared outer scope (not inside start()) so cancel()
  // below — a sibling of start(), not a nested closure inside it — can
  // also reach it. Assigned once start() actually runs.
  let cleanup: () => void = () => {};

  const stream = new ReadableStream({
    start(controller) {
      // The one place either delivery path actually writes to the wire —
      // both go through this, which is what makes the id-based dedup
      // below effective regardless of which path a given notification
      // arrives through first.
      const send = (event: string, data: unknown) => {
        if (closed) return;

        if (event === "notification") {
          const notification = data as NotificationPayload;
          if (sentIds.has(notification.id)) return;
          sentIds.add(notification.id);
          if (sentIds.size > MAX_TRACKED_IDS) {
            const oldest = sentIds.values().next().value;
            if (oldest !== undefined) sentIds.delete(oldest);
          }
          const createdAt = new Date(notification.createdAt);
          if (createdAt > lastSeenAt) lastSeenAt = createdAt;
        }

        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const unsubscribe = subscribe(userId, { send });

      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, HEARTBEAT_INTERVAL_MS);

      // Guards against overlapping polls: if one poll is still waiting on
      // the DB (e.g. queueing for a pooled connection under load) when the
      // next interval tick fires, that tick is skipped rather than piling
      // another concurrent query onto an already-contended pool — see
      // docs/marketplace/decisions/notification-poll-connection-safety.md.
      let polling = false;

      // Fallback path — see file header. Catches notifications created on
      // a different server instance than this connection is held open on.
      // Rows already delivered by the broadcaster are filtered out by
      // send()'s sentIds check above, not here — the createdAt cursor is
      // just a query-size optimization (don't re-fetch old rows forever),
      // not the correctness guarantee.
      //
      // try/catch is load-bearing, not defensive boilerplate: this
      // callback runs inside a bare setInterval, so an unawaited rejection
      // here (e.g. a P2024 pool-timeout while the DB is under load) would
      // otherwise surface as an unhandled promise rejection instead of a
      // single failed poll — the connection itself must survive a
      // transient DB hiccup and just try again on the next tick.
      const poll = setInterval(async () => {
        if (closed || polling) return;
        polling = true;
        // Temporary diagnostic (see the decision doc above) — wall-clock
        // time for the whole await, to compare against Prisma's own
        // engine-reported query duration (logged separately when
        // DB_TIMING_DEBUG=1 — see src/lib/prisma.ts) and isolate how much
        // of any slowness is time spent queueing for a pooled connection
        // versus actual query execution. Safe to remove once the pool
        // sizing is confirmed fixed.
        const startedAt = Date.now();
        try {
          const rows = await prisma.notification.findMany({
            where: { userId, createdAt: { gt: lastSeenAt } },
            orderBy: { createdAt: "asc" },
          });
          if (process.env.DB_TIMING_DEBUG === "1") {
            console.log(`[notifications/stream] poll total=${Date.now() - startedAt}ms rows=${rows.length}`);
          }
          for (const row of rows) {
            send("notification", {
              id: row.id,
              scope: row.scope,
              type: row.type,
              title: row.title,
              message: row.message,
              read: row.read,
              link: row.link,
              orderId: row.orderId,
              businessId: row.businessId,
              createdAt: row.createdAt.toISOString(),
            });
          }
        } catch (error) {
          console.error("[notifications/stream] Poll failed:", error);
        } finally {
          polling = false;
        }
      }, POLL_INTERVAL_MS);

      cleanup = () => {
        clearInterval(heartbeat);
        clearInterval(poll);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the client disconnecting — nothing to do.
        }
      };

      request.signal.addEventListener("abort", () => {
        if (closed) return;
        closed = true;
        cleanup();
      });
    },
    // Called by the platform when the client disconnects in a way that
    // doesn't fire request.signal's "abort" event (observed to happen —
    // relying on "abort" alone left the heartbeat/poll intervals running
    // forever in that case, since `closed` was set true here without ever
    // actually clearing them). Both paths now funnel through the same
    // idempotent teardown.
    cancel() {
      if (closed) return;
      closed = true;
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
