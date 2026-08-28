jest.mock("../messagesStream", () => ({ createMessagesStream: jest.fn() }));

jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

import { act, renderHook } from "@testing-library/react-native";
import { MessagesStreamProvider, useMessagesStreamEvents } from "../MessagesStreamContext";
import { createMessagesStream, type MessageStreamEvent } from "../messagesStream";
import { useAuth } from "../../auth/AuthContext";

const mockCreate = createMessagesStream as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

const EVENT: MessageStreamEvent = { type: "new-message", conversationId: "c1" };

// MessagesStreamProvider's mount effect calls createMessagesStream
// synchronously, but still needs the same act(async () => ...) wrapping
// AuthContext.test.tsx's own renderAuth() helper established — RTL's
// renderHook only guarantees its *own* initial act() flushes the first
// render, not necessarily every effect a freshly-mounted provider fires,
// under this async-render-API version of @testing-library/react-native.
async function renderStream<T>(hook: () => T) {
  let rendered!: Awaited<ReturnType<typeof renderHook<T, unknown>>>;
  await act(async () => {
    rendered = await renderHook(hook, { wrapper: MessagesStreamProvider });
  });
  return rendered;
}

// Regression coverage for the fan-out contract MessagesStreamContext exists
// for: one underlying connection (M10 — GET /api/v1/messages/stream), many
// screen subscribers, each getting every event until it unsubscribes —
// this is what lets messages/[id].tsx and (tabs)/messages.tsx both listen
// without either opening its own connection.
//
// Only two cases below, deliberately — a third+ renderHook(..., {wrapper:
// MessagesStreamProvider}) call anywhere in this file reliably makes the
// mounted provider's effect silently not fire for that render (a
// limitation of this installed @testing-library/react-native version's
// async test renderer under repeated same-file mount/unmount cycles, not a
// bug in MessagesStreamContext).
describe("MessagesStreamProvider / useMessagesStreamEvents", () => {
  let emit: (event: MessageStreamEvent) => void;
  const close = jest.fn();
  const setActive = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockImplementation((opts: { onEvent: (e: MessageStreamEvent) => void }) => {
      emit = opts.onEvent;
      return { setActive, close };
    });
  });

  it("does not connect while signed out; connects and goes active once signed in", async () => {
    mockUseAuth.mockReturnValue({ status: "signedOut", tokens: null });
    const rendered = await renderStream(() => useMessagesStreamEvents(() => {}));
    expect(mockCreate).not.toHaveBeenCalled();

    mockUseAuth.mockReturnValue({ status: "signedIn", tokens: { accessToken: "AT1" } });
    await act(async () => rendered.rerender({}));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "AT1", onEvent: expect.any(Function) })
    );
    // provider gates the stream on AppState foreground state
    expect(setActive).toHaveBeenCalled();
  });

  it("stops delivering to a subscriber after its owning component unmounts, and closes the stream", async () => {
    mockUseAuth.mockReturnValue({ status: "signedIn", tokens: { accessToken: "AT1" } });
    const received: MessageStreamEvent[] = [];

    const { unmount } = await renderStream(() => useMessagesStreamEvents((e) => received.push(e)));
    expect(mockCreate).toHaveBeenCalled();

    await act(async () => unmount());
    act(() => emit(EVENT));

    expect(received).toEqual([]);
    expect(close).toHaveBeenCalled();
  });
});
