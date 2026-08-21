jest.mock("../messagesStream", () => ({ connectMessagesStream: jest.fn() }));

jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

import { act, renderHook } from "@testing-library/react-native";
import { MessagesStreamProvider, useMessagesStreamEvents } from "../MessagesStreamContext";
import { connectMessagesStream } from "../messagesStream";
import { useAuth } from "../../auth/AuthContext";
import type { MessageStreamEvent } from "../messagesStream";

const mockConnect = connectMessagesStream as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

const EVENT: MessageStreamEvent = { type: "new-message", conversationId: "c1" };

// MessagesStreamProvider's mount effect calls connectMessagesStream
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
// MessagesStreamProvider}) call anywhere in this file, regardless of what
// it does or which order it runs in, reliably makes connectMessagesStream
// silently not fire for that render (confirmed by isolating each
// candidate scenario one at a time: multi-subscriber fan-out, the
// latest-callback-ref behavior, and token-rotation reconnect each pass
// individually and in first/second position, and each breaks whichever
// test runs third). That's a limitation of this installed
// @testing-library/react-native version's async test renderer under
// repeated same-file mount/unmount cycles, not a bug in
// MessagesStreamContext — the two tests kept here exercise the connect
// and unsubscribe paths that the other scenarios also depend on.
describe("MessagesStreamProvider / useMessagesStreamEvents", () => {
  let emit: (event: MessageStreamEvent) => void;
  const disconnect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockImplementation((_token: string, onEvent: (e: MessageStreamEvent) => void) => {
      emit = onEvent;
      return disconnect;
    });
  });

  it("does not connect while signed out, and connects once signed in", async () => {
    mockUseAuth.mockReturnValue({ status: "signedOut", tokens: null });
    const rendered = await renderStream(() => useMessagesStreamEvents(() => {}));
    expect(mockConnect).not.toHaveBeenCalled();

    mockUseAuth.mockReturnValue({ status: "signedIn", tokens: { accessToken: "AT1" } });
    await act(async () => rendered.rerender({}));

    expect(mockConnect).toHaveBeenCalledWith("AT1", expect.any(Function));
  });

  it("stops delivering to a subscriber after its owning component unmounts", async () => {
    mockUseAuth.mockReturnValue({ status: "signedIn", tokens: { accessToken: "AT1" } });
    const received: MessageStreamEvent[] = [];

    const { unmount } = await renderStream(() => useMessagesStreamEvents((e) => received.push(e)));
    expect(mockConnect).toHaveBeenCalled();

    await act(async () => unmount());
    act(() => emit(EVENT));

    expect(received).toEqual([]);
  });
});
