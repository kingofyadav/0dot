import "server-only";
import type { RealtimeDriver } from "./bus";

// The in-memory realtime driver — the current single-process pub/sub that
// message-events.ts / community-chat-events.ts / livestream-chat-events.ts
// each used to hand-roll, lifted into one place. This is the default (used
// whenever no Redis env is configured) and the driver the tests run
// against.
//
// globalThis-backed for the same reason db.ts's PrismaClient singleton is:
// in dev, Next's bundler can hand a Route Handler and a Server Action
// separate instantiations of this module, which would silently give them
// different Maps — a publish writing to one, a subscribe reading the other,
// so no event arrives. globalThis is process-wide regardless of which
// module registry loaded this file.
//
// As before: resets on process restart, and is single-process only — with
// two Vercel instances a publish on one is invisible to subscribers on the
// other. The Redis driver (driver-redis.ts) is what removes that ceiling;
// this stays the local fan-out layer underneath it.

type Subscriber = (message: string) => void;

const globalForMemoryDriver = globalThis as unknown as {
  realtimeMemorySubscribers: Map<string, Set<Subscriber>> | undefined;
};

const subscribers =
  globalForMemoryDriver.realtimeMemorySubscribers ?? new Map<string, Set<Subscriber>>();

if (process.env.NODE_ENV !== "production") {
  globalForMemoryDriver.realtimeMemorySubscribers = subscribers;
}

export const memoryDriver: RealtimeDriver = {
  publish(channel, message) {
    const set = subscribers.get(channel);
    if (!set) return;
    // Copy before iterating: a subscriber callback that unsubscribes
    // itself (the common case on SSE disconnect) would otherwise mutate
    // the Set mid-iteration.
    for (const callback of [...set]) callback(message);
  },

  subscribe(channel, callback) {
    let set = subscribers.get(channel);
    if (!set) {
      set = new Set();
      subscribers.set(channel, set);
    }
    set.add(callback);

    return () => {
      set.delete(callback);
      if (set.size === 0) subscribers.delete(channel);
    };
  },
};
