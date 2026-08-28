const mockInstances: FakeEventSource[] = [];

interface FakeEventSource {
  url: string;
  options: { headers: Record<string, string> };
  listeners: Record<string, ((e: unknown) => void)[]>;
  closed: boolean;
  lastEventId: string | null;
  _pollAgain: () => void;
  addEventListener(type: string, cb: (e: unknown) => void): void;
  removeAllEventListeners(): void;
  close(): void;
  emit(type: string, e?: unknown): void;
}

jest.mock("react-native-sse", () => {
  class FakeES {
    listeners: Record<string, ((e: unknown) => void)[]> = {};
    closed = false;
    lastEventId: string | null = null;
    _pollAgain = () => {};
    url: string;
    options: unknown;
    constructor(url: string, options: unknown) {
      this.url = url;
      this.options = options;
      mockInstances.push(this as unknown as FakeEventSource);
    }
    addEventListener(type: string, cb: (e: unknown) => void) {
      (this.listeners[type] ??= []).push(cb);
    }
    removeAllEventListeners() {
      this.listeners = {};
    }
    close() {
      this.closed = true;
    }
    emit(type: string, e: unknown = {}) {
      for (const cb of this.listeners[type] ?? []) cb(e);
    }
  }
  return { __esModule: true, default: FakeES };
});

import { createEventStream } from "../eventStream";

type E = { type: "thing" } | { type: "resync" };

beforeEach(() => {
  mockInstances.length = 0;
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

const latest = () => mockInstances[mockInstances.length - 1];

describe("createEventStream — Last-Event-ID replay", () => {
  it("with NO server id frames, emits client `resync` on every reconnect (messages-stream behaviour)", () => {
    const events: E[] = [];
    const s = createEventStream<E>({ path: "/x", accessToken: "AT", onEvent: (e) => events.push(e) });
    s.setActive(true);
    latest().emit("open");

    latest().emit("error");
    jest.advanceTimersByTime(2_000);
    latest().emit("open");

    expect(events).toEqual([{ type: "resync" }]);
  });

  it("once the server sends an id, reconnects carry Last-Event-ID and DON'T emit client resync", () => {
    const events: E[] = [];
    const s = createEventStream<E>({ path: "/x", accessToken: "AT", onEvent: (e) => events.push(e) });
    s.setActive(true);
    latest().emit("open");

    // server frame with an id (react-native-sse sets .lastEventId + puts it on the event)
    latest().lastEventId = "7";
    latest().emit("message", { data: JSON.stringify({ type: "thing" }), lastEventId: "7" });

    latest().emit("error");
    jest.advanceTimersByTime(2_000);

    // new connection is seeded with the id → it will send the header
    expect(latest().lastEventId).toBe("7");
    latest().emit("open");

    // the live `thing` came through; no client-side resync
    expect(events).toEqual([{ type: "thing" }]);
  });

  it("carries the id across a background/foreground (setActive false → true) too", () => {
    const s = createEventStream<E>({ path: "/x", accessToken: "AT", onEvent: () => {} });
    s.setActive(true);
    latest().emit("open");
    latest().lastEventId = "42";
    latest().emit("message", { data: JSON.stringify({ type: "thing" }), lastEventId: "42" });

    s.setActive(false); // background
    s.setActive(true); // foreground

    expect(latest().lastEventId).toBe("42");
  });
});
