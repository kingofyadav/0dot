import { describe, it, expect } from "vitest";
import { sendMessage } from "@/app/actions/messages";
import { getOrCreateDirectConversation } from "@/lib/messaging";
import { createUser, createSessionForUser } from "@/test/factories";
import { setSessionCookie } from "@/test/next-test-state";

function fd(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

async function loginAs(userId: string) {
  setSessionCookie(await createSessionForUser(userId));
}

// getParticipant(conversationId, user.id) (messaging.ts) is the query-layer
// check sendMessage relies on — no separate authorization step exists, so a
// caller who isn't a participant of the conversation must not be able to
// post into it, and a real participant must actually succeed.
describe("sendMessage", () => {
  it("rejects a sender who isn't a participant of the conversation", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const stranger = await createUser();
    const { conversation } = await getOrCreateDirectConversation(alice.id, bob.id);

    await loginAs(stranger.id);
    const result = await sendMessage(fd({ conversationId: conversation.id, body: "hi" }));

    expect(result).toEqual({ error: "Conversation not found." });
  });

  it("lets an actual participant send a message", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const { conversation } = await getOrCreateDirectConversation(alice.id, bob.id);

    await loginAs(alice.id);
    const result = await sendMessage(fd({ conversationId: conversation.id, body: "hello bob" }));

    expect("message" in result).toBe(true);
    if ("message" in result) {
      expect(result.message.body).toBe("hello bob");
      expect(result.message.senderId).toBe(alice.id);
    }
  });

  it("rejects an empty body with no attachment", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const { conversation } = await getOrCreateDirectConversation(alice.id, bob.id);

    await loginAs(alice.id);
    const result = await sendMessage(fd({ conversationId: conversation.id, body: "   " }));

    expect(result).toEqual({ error: "Message can't be empty." });
  });
});
