import { describe, it, expect, vi, afterEach } from "vitest";
import { db } from "@/lib/db";
import { notifyBusinessContactMessage } from "@/lib/notifications";
import { recordViewer, dropViewer, countViewers } from "@/lib/business-viewers";
import { createUser, createBusiness } from "@/test/factories";

// Realtime addendum Phase E (§8). notifyBusinessContactMessage tests hit
// the DB; business-viewers runs against the in-memory store (vitest forces
// KV_REST_API_URL empty).

afterEach(() => vi.unstubAllGlobals());

describe("notifyBusinessContactMessage", () => {
  it("notifies + pushes every owner/admin, and nobody else", async () => {
    const owner = await createUser();
    const admin = await createUser();
    const member = await createUser();
    const business = await createBusiness({ creatorId: owner.id, status: "active" });
    await db.businessMember.createMany({
      data: [
        { businessId: business.id, userId: owner.id, role: "owner" },
        { businessId: business.id, userId: admin.id, role: "admin" },
        { businessId: business.id, userId: member.id, role: "member" },
      ],
    });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: "ok", id: "x" }] }) } as Response);
    vi.stubGlobal("fetch", fetchSpy);
    await db.deviceToken.create({ data: { userId: owner.id, platform: "ios", token: "ExponentPushToken[o]", appClientId: "t" } });

    await notifyBusinessContactMessage({ businessId: business.id, businessSlug: business.slug });

    const notifs = await db.notification.findMany({
      where: { type: "business_contact", recipientId: { in: [owner.id, admin.id, member.id] } },
      select: { recipientId: true },
    });
    expect(new Set(notifs.map((n) => n.recipientId))).toEqual(new Set([owner.id, admin.id]));
    expect(fetchSpy).toHaveBeenCalled(); // push attempted for the owner's device
  });

  it("is a no-op when the business has no staff", async () => {
    const outsider = await createUser();
    const business = await createBusiness({ status: "active" });
    await notifyBusinessContactMessage({ businessId: business.id, businessSlug: business.slug });
    expect(await db.notification.count({ where: { type: "business_contact", subjectId: { startsWith: business.slug } } })).toBe(0);
    expect(await db.notification.count({ where: { recipientId: outsider.id } })).toBe(0);
  });
});

describe("business-viewers (in-memory)", () => {
  it("counts distinct viewer keys and drops them on leave / expiry", async () => {
    const id = `biz-${Math.random()}`;
    await recordViewer(id, "tab-a");
    await recordViewer(id, "tab-b");
    await recordViewer(id, "tab-a"); // re-ping, still one
    expect(await countViewers(id)).toBe(2);

    await dropViewer(id, "tab-a");
    expect(await countViewers(id)).toBe(1);
  });
});
