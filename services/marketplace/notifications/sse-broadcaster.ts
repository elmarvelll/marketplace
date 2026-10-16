// services/marketplace/notifications/sse-broadcaster.ts
//
// In-process pub/sub for the notification SSE stream
// (src/app/api/marketplace/notifications/stream/route.ts). A module-level
// map of userId -> the set of live ReadableStream controllers for that
// user (normally one, but nothing stops a user having the marketplace open
// in two tabs). notification.service.ts#createNotification calls publish()
// right after writing the row so an already-open connection gets it
// immediately, with no client-side polling.
//
// Known limitation (documented, not solved here — see the plan this was
// built from): this only reaches connections held open on the SAME server
// process. On a multi-instance deployment, a notification created by a
// request handled on instance B won't reach a connection open on instance
// A via this map alone — the SSE route's own short DB-poll fallback (see
// stream/route.controller.ts) is what actually guarantees delivery across
// instances, within a few seconds. This broadcaster is the fast path, not
// the only path.

type Subscriber = {
  send: (event: string, data: unknown) => void;
};

const subscribers = new Map<string, Set<Subscriber>>();

export function subscribe(userId: string, subscriber: Subscriber): () => void {
  let set = subscribers.get(userId);
  if (!set) {
    set = new Set();
    subscribers.set(userId, set);
  }
  set.add(subscriber);

  return () => {
    const current = subscribers.get(userId);
    if (!current) return;
    current.delete(subscriber);
    if (current.size === 0) subscribers.delete(userId);
  };
}

export function publish(userId: string, notification: unknown): void {
  const set = subscribers.get(userId);
  if (!set) return;
  for (const subscriber of set) {
    subscriber.send("notification", notification);
  }
}
