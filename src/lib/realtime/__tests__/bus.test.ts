import { describe, it, expect, vi, beforeEach } from "vitest";
import { bus, createChannel } from "@/lib/realtime/bus";
import { memoryDriver } from "@/lib/realtime/driver-memory";

// The realtime backplane (docs/specs/addendum-realtime-community.md §4).
// These exercise the in-memory driver directly — the default whenever no
// Redis env is configured, and the one the whole test suite runs against.

describe("realtime bus — in-memory driver", () => {
  it("delivers a published message to every subscriber of that channel", () => {
    const a = vi.fn();
    const b = vi.fn();
    memoryDriver.subscribe("chan:1", a);
    memoryDriver.subscribe("chan:1", b);

    memoryDriver.publish("chan:1", "hello");

    expect(a).toHaveBeenCalledWith("hello");
    expect(b).toHaveBeenCalledWith("hello");
  });

  it("isolates channels — a publish on one is invisible to another", () => {
    const other = vi.fn();
    memoryDriver.subscribe("chan:other", other);

    memoryDriver.publish("chan:1", "nope");

    expect(other).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribe, and cleans up the empty channel", () => {
    const cb = vi.fn();
    const unsubscribe = memoryDriver.subscribe("chan:temp", cb);

    unsubscribe();
    memoryDriver.publish("chan:temp", "after");

    expect(cb).not.toHaveBeenCalled();
  });

  it("tolerates a subscriber that unsubscribes itself from inside its callback", () => {
    const seen: string[] = [];
    let unsub: () => void = () => {};
    unsub = memoryDriver.subscribe("chan:self", (msg) => {
      seen.push(msg);
      unsub(); // the SSE-disconnect case
    });
    const survivor = vi.fn();
    memoryDriver.subscribe("chan:self", survivor);

    memoryDriver.publish("chan:self", "one");
    memoryDriver.publish("chan:self", "two");

    expect(seen).toEqual(["one"]);
    expect(survivor).toHaveBeenCalledTimes(2);
  });

  it("publish to a channel with no subscribers is a no-op, not a throw", () => {
    expect(() => bus.publish("chan:empty", "x")).not.toThrow();
  });
});

describe("realtime bus — createChannel typed wrapper", () => {
  type Ping = { type: "ping"; n: number };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips a typed event through JSON on a prefixed channel", () => {
    const channel = createChannel<Ping>("test");
    const received: Ping[] = [];
    channel.subscribe("room-7", (e) => received.push(e));

    channel.publish("room-7", { type: "ping", n: 42 });

    expect(received).toEqual([{ type: "ping", n: 42 }]);
  });

  it("namespaces keys — same key, different prefix, no cross-talk", () => {
    const chatA = createChannel<Ping>("a");
    const chatB = createChannel<Ping>("b");
    const onB = vi.fn();
    chatB.subscribe("same-key", onB);

    chatA.publish("same-key", { type: "ping", n: 1 });

    expect(onB).not.toHaveBeenCalled();
  });

  it("drops a malformed payload without killing the subscription", () => {
    const channel = createChannel<Ping>("mal");
    const good = vi.fn();
    channel.subscribe("r", good);

    // Simulate a raw non-JSON frame arriving on the underlying bus channel.
    bus.publish("mal:r", "{not json");
    channel.publish("r", { type: "ping", n: 9 });

    expect(good).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledWith({ type: "ping", n: 9 });
  });
});
