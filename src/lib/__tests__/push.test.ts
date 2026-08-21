import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { getPushProvider, dispatchPushEvent } from "@/lib/push";
import { createUser } from "@/test/factories";

async function createDeviceToken(userId: string, overrides: Partial<{ token: string; platform: string }> = {}) {
  return db.deviceToken.create({
    data: {
      userId,
      platform: overrides.platform ?? "ios",
      token: overrides.token ?? `ExponentPushToken[${crypto.randomUUID()}]`,
      appClientId: "test-app-client",
    },
  });
}

function mockExpoPushResponse(body: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: async () => body } as Response));
}

// Regression coverage for the mobile-review finding: push delivery was a
// server-side no-op (StubPushProvider) even though registration worked end
// to end. getPushProvider() now returns a real ExpoPushProvider that talks
// to Expo's push relay — these tests mock fetch rather than hitting the
// real relay (its request/response shapes were confirmed once, manually,
// against https://exp.host/--/api/v2/push/send).
describe("push delivery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports success for an 'ok' ticket", async () => {
    mockExpoPushResponse({ data: [{ status: "ok", id: "abc" }] });

    const result = await getPushProvider().send({
      token: "ExponentPushToken[x]",
      platform: "ios",
      title: "0dot",
      body: "hi",
      data: { href: "/feed" },
    });

    expect(result).toEqual({ ok: true });
  });

  it("flags a DeviceNotRegistered error ticket as an invalid token", async () => {
    mockExpoPushResponse({ data: [{ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }] });

    const result = await getPushProvider().send({
      token: "ExponentPushToken[x]",
      platform: "android",
      title: "0dot",
      body: "hi",
      data: { href: "/feed" },
    });

    expect(result).toEqual({ ok: false, invalidToken: true });
  });

  it("doesn't flag a non-DeviceNotRegistered error as an invalid token", async () => {
    mockExpoPushResponse({ data: [{ status: "error", message: "rate limited", details: { error: "MessageRateExceeded" } }] });

    const result = await getPushProvider().send({
      token: "ExponentPushToken[x]",
      platform: "ios",
      title: "0dot",
      body: "hi",
      data: { href: "/feed" },
    });

    expect(result.ok).toBe(false);
    expect(result.invalidToken).toBeFalsy();
  });

  it("skips web_push tokens without calling the relay", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getPushProvider().send({
      token: "irrelevant",
      platform: "web_push",
      title: "0dot",
      body: "hi",
      data: { href: "/feed" },
    });

    expect(result).toEqual({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("prunes a DeviceToken once the relay reports it unregistered", async () => {
    const user = await createUser();
    const deviceToken = await createDeviceToken(user.id);
    mockExpoPushResponse({ data: [{ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }] });

    await dispatchPushEvent({ recipientId: user.id, type: "like", subjectType: "post", subjectId: "some-post-id" });

    expect(await db.deviceToken.findUnique({ where: { id: deviceToken.id } })).toBeNull();
  });

  it("leaves a DeviceToken alone on a transient send failure", async () => {
    const user = await createUser();
    const deviceToken = await createDeviceToken(user.id);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await dispatchPushEvent({ recipientId: user.id, type: "like", subjectType: "post", subjectId: "some-post-id" });

    expect(await db.deviceToken.findUnique({ where: { id: deviceToken.id } })).not.toBeNull();
  });
});
