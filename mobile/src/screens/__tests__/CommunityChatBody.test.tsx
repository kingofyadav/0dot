jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

jest.mock("react-native-safe-area-context", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

jest.mock("../../realtime/communityChatStream", () => ({ createCommunityChatStream: jest.fn() }));

jest.mock("../../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    getCommunityChat: jest.fn(),
    sendCommunityChatMessage: jest.fn(),
    deleteCommunityChatMessage: jest.fn(),
    sendCommunityChatTyping: jest.fn(),
    ApiError,
  };
});

import { act, render, waitFor } from "@testing-library/react-native";
import { CommunityChatBody } from "../CommunityChatBody";
import { useAuth } from "../../auth/AuthContext";
import { createCommunityChatStream } from "../../realtime/communityChatStream";
import { getCommunityChat } from "../../api/client";
import type { CommunityChatStreamEvent } from "../../realtime/communityChatStream";

const mockUseAuth = useAuth as jest.Mock;
const mockStream = createCommunityChatStream as jest.Mock;
const mockGetChat = getCommunityChat as jest.Mock;

function msg(id: string, body: string, senderId = "other-user") {
  return {
    id,
    body,
    createdAt: new Date().toISOString(),
    senderId,
    senderHandle: "sender",
    senderName: "Sender",
    senderAvatarUrl: null,
  };
}

// NOTE: kept to a small number of render() calls per file on purpose — this
// installed @testing-library/react-native version's async test renderer
// gets flaky under many mount/unmount cycles in one file (same limitation
// MessagesStreamContext.test.tsx documents). Each test does one render and
// asserts several things.
describe("CommunityChatBody", () => {
  let emit: (event: CommunityChatStreamEvent) => void;
  const close = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ me: { id: "me" }, tokens: { accessToken: "AT" } });
    mockStream.mockImplementation((opts: { onEvent: (e: CommunityChatStreamEvent) => void }) => {
      emit = opts.onEvent;
      return { setActive: jest.fn(), close };
    });
    mockGetChat.mockResolvedValue({ items: [msg("m1", "hello")], nextCursor: null, canSend: true });
  });

  it("loads history, then applies live append / dedupe / delete / resync, and closes on unmount", async () => {
    const screen = await render(<CommunityChatBody slug="general" />);
    await waitFor(() => expect(screen.getByText("hello")).toBeTruthy());
    expect(mockGetChat).toHaveBeenCalledTimes(1);

    // live append — and the same id arriving twice stays a single row
    await act(async () => emit({ type: "new-chat-message", message: msg("m2", "live message") }));
    await act(async () => emit({ type: "new-chat-message", message: msg("m2", "live message") }));
    await waitFor(() => expect(screen.getAllByText("live message")).toHaveLength(1));

    // live delete
    await act(async () => emit({ type: "chat-message-deleted", messageId: "m2" }));
    await waitFor(() => expect(screen.queryByText("live message")).toBeNull());

    // resync → refetch history
    await act(async () => emit({ type: "resync" }));
    await waitFor(() => expect(mockGetChat).toHaveBeenCalledTimes(2));

    await act(async () => screen.unmount());
    expect(close).toHaveBeenCalled();
  });

  it("shows a join prompt instead of the composer when the viewer can't send", async () => {
    mockGetChat.mockResolvedValue({ items: [], nextCursor: null, canSend: false });
    const { getByText, queryByLabelText } = await render(<CommunityChatBody slug="general" />);
    await waitFor(() => expect(getByText("Join this community to send messages.")).toBeTruthy());
    expect(queryByLabelText("Message text")).toBeNull();
  });
});
