import { describe, it, expect } from "vitest";
import { recordForReplay, getReplayFrames, currentSeq } from "@/lib/realtime/replay";
import { publishToCommunityChat, subscribeToCommunityChat } from "@/lib/community-chat-events";

// Under vitest KV_REST_API_URL is forced empty, so Redis is not configured
// — this exercises the graceful-degradation path: no buffer, no `id:`
// frames, the client falls back to `resync`. The Redis behaviour itself is
// covered by a live smoke (scripts / manual), same as the bus driver.

describe("replay — without Redis configured", () => {
  it("recordForReplay is a no-op returning null", async () => {
    expect(await recordForReplay("cchat:x", (seq) => ({ type: "t", seq }))).toBeNull();
  });

  it("getReplayFrames reports a gap (client should refetch)", async () => {
    expect(await getReplayFrames("cchat:x", 5)).toEqual({ kind: "gap" });
  });

  it("currentSeq is 0", async () => {
    expect(await currentSeq("cchat:x")).toBe(0);
  });
});

describe("publishToCommunityChat — without Redis", () => {
  it("still delivers the event live, just un-sequenced", async () => {
    const received: unknown[] = [];
    const unsub = subscribeToCommunityChat("c1", (e) => received.push(e));

    await publishToCommunityChat("c1", { type: "new-chat-message", message: { id: "m1" } as never });
    await publishToCommunityChat("c1", { type: "typing", userId: "u1", name: "Ann" });

    unsub();
    expect(received).toEqual([
      { type: "new-chat-message", message: { id: "m1" } }, // no `seq`
      { type: "typing", userId: "u1", name: "Ann" },
    ]);
  });
});
