jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));

jest.mock("@expo/vector-icons/Ionicons", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  return View;
});

jest.mock("@livekit/react-native", () => ({
  registerGlobals: jest.fn(),
  AudioSession: { startAudioSession: jest.fn().mockResolvedValue(undefined), stopAudioSession: jest.fn().mockResolvedValue(undefined) },
}));

const mockRoom = {
  on: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  localParticipant: { setMicrophoneEnabled: jest.fn().mockResolvedValue(undefined) },
};
jest.mock("livekit-client", () => ({
  Room: jest.fn(() => mockRoom),
  RoomEvent: { Disconnected: "disconnected", TrackSubscribed: "trackSubscribed" },
}));

jest.mock("../../realtime/voiceRoomStream", () => ({ createVoiceRoomStream: jest.fn() }));

jest.mock("../../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(m: string, s: number) {
      super(m);
      this.status = s;
    }
  }
  return {
    getVoiceRoom: jest.fn(),
    voiceRoomAction: jest.fn().mockResolvedValue({ ok: true }),
    getVoiceRoomToken: jest.fn().mockResolvedValue({ token: "T", url: "wss://lk" }),
    ApiError,
  };
});

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { VoiceRoomBody } from "../VoiceRoomBody";
import { useAuth } from "../../auth/AuthContext";
import { createVoiceRoomStream } from "../../realtime/voiceRoomStream";
import { getVoiceRoom, voiceRoomAction } from "../../api/client";
import type { VoiceRoomDetail } from "../../api/types";

const mockUseAuth = useAuth as jest.Mock;
const mockStream = createVoiceRoomStream as jest.Mock;
const mockGet = getVoiceRoom as jest.Mock;
const mockAction = voiceRoomAction as jest.Mock;

function detail(over: Partial<VoiceRoomDetail> = {}): VoiceRoomDetail {
  return {
    id: "room-1",
    title: "Test room",
    status: "live",
    isCreator: false,
    isStaff: false,
    canSpeak: true,
    myRole: "listener",
    isParticipant: true,
    currentSpeakerId: null,
    currentSpeakerName: null,
    floorFree: true,
    queuePosition: null,
    isMyTurnNext: false,
    participants: [{ userId: "me", role: "listener", displayName: "Me", avatarUrl: null }],
    ...over,
  };
}

describe("VoiceRoomBody", () => {
  let emit: () => void;
  const streamClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ me: { id: "me" }, tokens: { accessToken: "AT" } });
    mockStream.mockImplementation((opts: { onEvent: () => void }) => {
      emit = opts.onEvent;
      return { setActive: jest.fn(), close: streamClose };
    });
    mockGet.mockResolvedValue(detail());
  });

  it("loads a room, requests the floor, refetches on a room-updated, and tears down", async () => {
    const screen = await render(<VoiceRoomBody slug="general" roomId="room-1" />);
    await waitFor(() => expect(screen.getByText("The floor is free")).toBeTruthy());
    expect(mockGet).toHaveBeenCalledTimes(1);

    // a listener sees "Request to speak" and pressing it hits the action route
    await act(async () => fireEvent.press(screen.getByText("Request to speak")));
    expect(mockAction).toHaveBeenCalledWith("general", "room-1", "request-speak");

    // a live room-state event refetches
    mockGet.mockResolvedValue(detail({ currentSpeakerId: "other", currentSpeakerName: "Bob", floorFree: false }));
    await act(async () => emit());
    await waitFor(() => expect(screen.getByText("Bob is speaking")).toBeTruthy());

    await act(async () => screen.unmount());
  });

  it("shows Join for a non-participant", async () => {
    mockGet.mockResolvedValue(detail({ isParticipant: false, myRole: null }));
    const { getByText } = await render(<VoiceRoomBody slug="general" roomId="room-1" />);
    await waitFor(() => expect(getByText("Join room")).toBeTruthy());
  });
});
