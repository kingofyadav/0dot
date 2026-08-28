// A controllable fake for react-native-sse's EventSource so the
// connect / backoff / AppState logic in createMessagesStream can be tested
// without a real network or XHR. `mock`-prefixed so jest's mock-factory
// hoist rule allows the reference.
const mockInstances: FakeEventSource[] = [];

interface FakeEventSource {
  url: string;
  options: unknown;
  listeners: Record<string, ((e: unknown) => void)[]>;
  closed: boolean;
  _pollAgain: () => void;
  addEventListener(type: string, cb: (e: unknown) => void): void;
  removeAllEventListeners(): void;
  close(): void;
  emit(type: string, e?: unknown): void;
}

jest.mock("react-native-sse", () => {
  class FakeEventSourceImpl {
    listeners: Record<string, ((e: unknown) => void)[]> = {};
    closed = false;
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
  return { __esModule: true, default: FakeEventSourceImpl };
});

import { createMessagesStream, type MessageStreamEvent } from "../messagesStream";

beforeEach(() => {
  mockInstances.length = 0;
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

const latest = () => mockInstances[mockInstances.length - 1];

describe("createMessagesStream", () => {
  it("does not open a connection until setActive(true)", () => {
    createMessagesStream({ accessToken: "AT", onEvent: () => {} });
    expect(mockInstances).toHaveLength(0);
  });

  it("opens on setActive(true) with the bearer token, closes on setActive(false)", () => {
    const stream = createMessagesStream({ accessToken: "AT", onEvent: () => {} });
    stream.setActive(true);

    expect(mockInstances).toHaveLength(1);
    expect(latest().url).toContain("/api/v1/messages/stream");
    expect((latest().options as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer AT");

    stream.setActive(false);
    expect(latest().closed).toBe(true);
  });

  it("forwards parsed message events and ignores malformed frames", () => {
    const events: MessageStreamEvent[] = [];
    const stream = createMessagesStream({ accessToken: "AT", onEvent: (e) => events.push(e) });
    stream.setActive(true);

    latest().emit("message", { data: JSON.stringify({ type: "new-message", conversationId: "c1" }) });
    latest().emit("message", { data: "{not json" });

    expect(events).toEqual([{ type: "new-message", conversationId: "c1" }]);
  });

  it("reconnects with backoff after an error, and emits `resync` once reconnected", () => {
    const events: MessageStreamEvent[] = [];
    const stream = createMessagesStream({ accessToken: "AT", onEvent: (e) => events.push(e) });
    stream.setActive(true);
    latest().emit("open"); // first connection — no resync
    expect(events).toEqual([]);

    latest().emit("error", { type: "error" });
    expect(latest().closed).toBe(true);

    const before = mockInstances.length;
    jest.advanceTimersByTime(2_000); // past the 1s base delay (+ up to 100% jitter)
    expect(mockInstances.length).toBe(before + 1);

    latest().emit("open");
    expect(events).toEqual([{ type: "resync" }]);
  });

  it("close() is permanent — no reconnect after an error", () => {
    const stream = createMessagesStream({ accessToken: "AT", onEvent: () => {} });
    stream.setActive(true);
    stream.close();

    latest().emit("error", { type: "error" });
    jest.advanceTimersByTime(60_000);

    expect(mockInstances).toHaveLength(1);
  });
});
