import { describe, it, expect } from "vitest";
import {
  voiceRoomLkName,
  isLiveKitVoiceConfigured,
  ensureVoiceRoom,
  closeVoiceRoom,
  setVoicePublish,
  kickFromVoiceRoom,
  mintVoiceRoomToken,
} from "@/lib/voice-livekit";

// vitest forces LIVEKIT_* empty (vitest.config.ts), so this covers the
// no-op-without-creds path. The real LiveKit calls are smoke-tested
// against the live service (`.env` has working creds) — see the spec.

describe("voice-livekit", () => {
  it("maps a room id to its LiveKit room name", () => {
    expect(voiceRoomLkName("abc-123")).toBe("voiceroom_abc-123");
  });

  it("reports LiveKit unconfigured under test", () => {
    expect(isLiveKitVoiceConfigured()).toBe(false);
  });

  it("every server helper is a safe no-op without credentials", async () => {
    await expect(ensureVoiceRoom("r1")).resolves.toBeUndefined();
    await expect(closeVoiceRoom("r1")).resolves.toBeUndefined();
    await expect(setVoicePublish("r1", "u1", true)).resolves.toBeUndefined();
    await expect(kickFromVoiceRoom("r1", "u1")).resolves.toBeUndefined();
  });

  it("mintVoiceRoomToken returns null without credentials", async () => {
    expect(await mintVoiceRoomToken({ roomId: "r1", userId: "u1", canPublish: false })).toBeNull();
  });
});
