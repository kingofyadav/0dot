import { describe, it, expect } from "vitest";
import { joinVoiceRoom } from "@/app/actions/voice-rooms";
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
