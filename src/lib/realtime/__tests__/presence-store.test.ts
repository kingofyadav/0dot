import { describe, it, expect, beforeEach, vi } from "vitest";
import { presenceStore } from "@/lib/realtime/presence-store";
import { markUserOnline, markUserOffline, isUserOnline, getOnlineUserIds } from "@/lib/presence";

// Presence store + the presence.ts policy layer on top of it (spec §4.4).
// Runs against the in-memory store — vitest forces KV_REST_API_URL="" so
// the Redis path is never taken here.

describe("presence store — in-memory", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("a user with one open connection is online; closing it takes them offline", async () => {
    presenceStore.connect("u1", "conn-a");
    expect(await presenceStore.isOnline("u1")).toBe(true);

    presenceStore.disconnect("u1", "conn-a");
    expect(await presenceStore.isOnline("u1")).toBe(false);
  });

  it("stays online while any connection remains (multi-tab / multi-device)", async () => {
    presenceStore.connect("u2", "conn-a");
    presenceStore.connect("u2", "conn-b");

    presenceStore.disconnect("u2", "conn-a");
    expect(await presenceStore.isOnline("u2")).toBe(true); // conn-b still open

    presenceStore.disconnect("u2", "conn-b");
    expect(await presenceStore.isOnline("u2")).toBe(false);
  });

  it("getOnline returns only the currently-connected subset", async () => {
    presenceStore.connect("on-1", "c1");
    presenceStore.connect("on-2", "c2");

    const online = await presenceStore.getOnline(["on-1", "on-2", "off-3"]);
    expect(online).toEqual(new Set(["on-1", "on-2"]));
  });

  it("disconnect of an unknown connection id is a no-op, not a throw", () => {
    expect(() => presenceStore.disconnect("nobody", "ghost")).not.toThrow();
  });
});

describe("presence.ts policy layer", () => {
  it("markUserOnline returns a connection id that markUserOffline clears", async () => {
    const connId = markUserOnline("p1");
    expect(typeof connId).toBe("string");
    expect(await isUserOnline("p1")).toBe(true);

    markUserOffline("p1", connId);
    expect(await isUserOnline("p1")).toBe(false);
  });

  it("does NOT fire onConfirmedOffline when the user reconnects within the grace window", async () => {
    vi.useFakeTimers();
    try {
      const first = markUserOnline("p2");
      const onOffline = vi.fn();
      markUserOffline("p2", first, onOffline);

      // reconnect before the 15s grace elapses
      markUserOnline("p2");
      await vi.advanceTimersByTimeAsync(15_000);

      expect(onOffline).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fires onConfirmedOffline after the grace window when there is no reconnect", async () => {
    vi.useFakeTimers();
    try {
      const connId = markUserOnline("p3");
      const onOffline = vi.fn();
      markUserOffline("p3", connId, onOffline);

      await vi.advanceTimersByTimeAsync(15_000);
      expect(onOffline).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("getOnlineUserIds batches a whole list into one lookup", async () => {
    const a = markUserOnline("batch-a");
    markUserOnline("batch-b");

    const online = await getOnlineUserIds(["batch-a", "batch-b", "batch-c"]);
    expect(online.has("batch-a")).toBe(true);
    expect(online.has("batch-b")).toBe(true);
    expect(online.has("batch-c")).toBe(false);

    markUserOffline("batch-a", a);
  });
});
