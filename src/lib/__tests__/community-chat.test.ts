import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { getRecentChatMessages, serializeChatMessage } from "@/lib/community-chat";
import { createUser, createCommunity } from "@/test/factories";

// Realtime addendum Phase C — the shared read + serialize helpers the web
// chat page and the new /api/v1 chat routes both build on. (The routes
// themselves aren't unit-tested: the codebase has no /api/v1 route-test
// harness — every v1 route would need a real OAuth token + app install —
// so coverage stays at the lib layer, the same place feed-visibility etc.
// are tested.)

async function createChatMessage(communityId: string, senderId: string, body: string, deletedAt: Date | null = null) {
  return db.communityChatMessage.create({
    data: { communityId, senderId, body, deletedAt },
    include: { sender: { include: { username: true, profile: true } } },
  });
}

describe("getRecentChatMessages", () => {
  it("returns non-deleted messages newest-first and hides soft-deleted ones", async () => {
    const community = await createCommunity();
    const sender = await createUser();
    await createChatMessage(community.id, sender.id, "first");
    const removed = await createChatMessage(community.id, sender.id, "removed", new Date());
    await createChatMessage(community.id, sender.id, "latest");

    const { items } = await getRecentChatMessages(community.id, null);
    const bodies = items.map((m) => m.body);

    expect(bodies).toEqual(["latest", "first"]);
    expect(bodies).not.toContain("removed");
    expect(items.some((m) => m.id === removed.id)).toBe(false);
  });

  it("scopes strictly to the given community", async () => {
    const [a, b] = [await createCommunity(), await createCommunity()];
    const sender = await createUser();
    await createChatMessage(a.id, sender.id, "in-a");
    await createChatMessage(b.id, sender.id, "in-b");

    const { items } = await getRecentChatMessages(a.id, null);
    expect(items.map((m) => m.body)).toEqual(["in-a"]);
  });
});

describe("serializeChatMessage", () => {
  it("flattens the sender relation to the wire shape (ISO date, handle, name, avatar)", async () => {
    const community = await createCommunity();
    const sender = await createUser();
    const row = await createChatMessage(community.id, sender.id, "hello");

    const payload = serializeChatMessage(row);

    expect(payload).toMatchObject({
      id: row.id,
      body: "hello",
      senderId: sender.id,
      senderHandle: row.sender.username?.handle ?? null,
    });
    expect(typeof payload.createdAt).toBe("string");
    expect(new Date(payload.createdAt).toISOString()).toBe(payload.createdAt);
  });
});
