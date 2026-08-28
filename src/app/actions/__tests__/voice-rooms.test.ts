import { describe, it, expect } from "vitest";
import { joinVoiceRoom, startVoiceRoom, startSpeaking, stopSpeaking, requestToSpeak } from "@/app/actions/voice-rooms";
import { createLiveVoiceRoom, endVoiceRoom } from "@/lib/voice-room-actions";
import { MAX_CONCURRENT_VOICE_ROOMS_PER_COMMUNITY } from "@/lib/voice-rooms";
import { createUser, createCommunity, addCommunityMember, createSessionForUser } from "@/test/factories";
import { setSessionCookie } from "@/test/next-test-state";
import { db } from "@/lib/db";

async function loginAs(userId: string) {
  const token = await createSessionForUser(userId);
  setSessionCookie(token);
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function createLiveRoom(communityId: string, creatorId: string) {
  return db.voiceRoom.create({
    data: { communityId, title: "Test room", status: "live", startsAt: new Date(), createdBy: creatorId },
  });
}

function getParticipant(roomId: string, userId: string) {
  return db.voiceRoomParticipant.findUnique({ where: { voiceRoomId_userId: { voiceRoomId: roomId, userId } } });
}

// Regression coverage for BUGS.md #4 ("Voice room join has no
// community-membership or ban check") — joinVoiceRoom must reject anyone
// who isn't an active member, mirroring createVoiceRoom's existing check.
describe("joinVoiceRoom", () => {
  it("does not add a non-member of the room's community as a participant", async () => {
    const owner = await createUser();
    const community = await createCommunity({ creatorId: owner.id, visibility: "private" });
    await addCommunityMember(community.id, owner.id, { role: "owner" });
    const room = await createLiveRoom(community.id, owner.id);

    const outsider = await createUser();
    await loginAs(outsider.id);
    await joinVoiceRoom(formData({ voiceRoomId: room.id }));

    expect(await getParticipant(room.id, outsider.id)).toBeNull();
  });

  it("does not add a banned member as a participant", async () => {
    const owner = await createUser();
    const community = await createCommunity({ creatorId: owner.id });
    await addCommunityMember(community.id, owner.id, { role: "owner" });
    const room = await createLiveRoom(community.id, owner.id);

    const banned = await createUser();
    await addCommunityMember(community.id, banned.id, { status: "banned" });
    await loginAs(banned.id);
    await joinVoiceRoom(formData({ voiceRoomId: room.id }));

    expect(await getParticipant(room.id, banned.id)).toBeNull();
  });

  it("adds an active member as a listener", async () => {
    const owner = await createUser();
    const community = await createCommunity({ creatorId: owner.id });
    await addCommunityMember(community.id, owner.id, { role: "owner" });
    const room = await createLiveRoom(community.id, owner.id);

    const member = await createUser();
    await addCommunityMember(community.id, member.id);
    await loginAs(member.id);
    await joinVoiceRoom(formData({ voiceRoomId: room.id }));

    const participant = await getParticipant(room.id, member.id);
    expect(participant?.role).toBe("listener");
  });
});

// Phase D (docs/specs/addendum-voice-rooms-livekit.md). LiveKit helpers
// no-op under test (vitest forces LIVEKIT_* empty), so these assert the DB
// state the floor model drives.
describe("Phase D — voice room floor + cost guards", () => {
  async function activeMember(communityId: string) {
    const u = await createUser();
    await addCommunityMember(communityId, u.id);
    return u;
  }

  it("startVoiceRoom refuses once the community is at the concurrent-room cap", async () => {
    const owner = await createUser();
    const community = await createCommunity({ creatorId: owner.id });
    await addCommunityMember(community.id, owner.id, { role: "owner" });
    await loginAs(owner.id);

    for (let i = 0; i < MAX_CONCURRENT_VOICE_ROOMS_PER_COMMUNITY; i++) {
      await createLiveRoom(community.id, owner.id);
    }
    const scheduled = await db.voiceRoom.create({
      data: { communityId: community.id, title: "one too many", status: "scheduled", startsAt: new Date(), createdBy: owner.id },
    });

    await startVoiceRoom(formData({ voiceRoomId: scheduled.id }));

    expect((await db.voiceRoom.findUnique({ where: { id: scheduled.id } }))?.status).toBe("scheduled");
  });

  it("createLiveVoiceRoom rejects a non-member and starts a live room for an active member", async () => {
    const owner = await createUser();
    const community = await createCommunity({ creatorId: owner.id });
    await addCommunityMember(community.id, owner.id, { role: "owner" });

    const outsider = await createUser();
    expect(await createLiveVoiceRoom(outsider.id, community.id, "Nope")).toEqual({ error: expect.stringContaining("active member") });

    const result = await createLiveVoiceRoom(owner.id, community.id, "Standup");
    expect("id" in result).toBe(true);
    if ("id" in result) {
      const room = await db.voiceRoom.findUnique({ where: { id: result.id } });
      expect(room?.status).toBe("live");
      expect(await getParticipant(result.id, owner.id)).not.toBeNull();
    }
  });

  it("endVoiceRoom (by creator) ends the room and clears the floor", async () => {
    const owner = await createUser();
    const community = await createCommunity({ creatorId: owner.id });
    await addCommunityMember(community.id, owner.id, { role: "owner" });
    const room = await createLiveRoom(community.id, owner.id);
    await db.voiceRoom.update({ where: { id: room.id }, data: { currentSpeakerId: owner.id, currentSpeakerSince: new Date() } });

    expect(await endVoiceRoom(owner.id, room.id)).toEqual({ ok: true });
    const ended = await db.voiceRoom.findUnique({ where: { id: room.id } });
    expect(ended?.status).toBe("ended");
    expect(ended?.currentSpeakerId).toBeNull();
  });

  it("startSpeaking → stopSpeaking moves the floor and clears the speaker role", async () => {
    const owner = await createUser();
    const community = await createCommunity({ creatorId: owner.id });
    await addCommunityMember(community.id, owner.id, { role: "owner" });
    const room = await createLiveRoom(community.id, owner.id);

    const speaker = await activeMember(community.id);
    await loginAs(speaker.id);
    await joinVoiceRoom(formData({ voiceRoomId: room.id }));
    await requestToSpeak(formData({ voiceRoomId: room.id }));
    await startSpeaking(formData({ voiceRoomId: room.id }));

    expect((await db.voiceRoom.findUnique({ where: { id: room.id } }))?.currentSpeakerId).toBe(speaker.id);
    expect((await getParticipant(room.id, speaker.id))?.role).toBe("speaker");

    await stopSpeaking(formData({ voiceRoomId: room.id }));

    expect((await db.voiceRoom.findUnique({ where: { id: room.id } }))?.currentSpeakerId).toBeNull();
    expect((await getParticipant(room.id, speaker.id))?.role).toBe("listener");
  });
});
