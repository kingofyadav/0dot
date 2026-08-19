import { describe, it, expect } from "vitest";
import { installApp } from "@/app/actions/marketplace";
import { createUser, createSessionForUser } from "@/test/factories";
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

async function createFreeAppListing() {
  const seller = await createUser();
  return db.marketplaceListing.create({
    data: {
      sellerType: "user",
      sellerUserId: seller.id,
      category: "app",
      title: "Test app",
      price: null,
      status: "active",
      payload: "{}",
    },
  });
}

// Regression coverage for installApp's read-then-write race: the
// findFirst-then-create check had no DB backstop, so two concurrent
// installs for the same listing+installer could both pass the check and
// create duplicate InstalledApp rows. Now backed by three partial unique
// indexes (migration 20260818150500) plus a P2002 catch.
describe("installApp", () => {
  it("installs successfully once", async () => {
    const listing = await createFreeAppListing();
    const installer = await createUser();
    await loginAs(installer.id);

    const result = await installApp(undefined, formData({ listingId: listing.id, installerType: "user", installerId: "" }));
    expect(result).toBeUndefined();

    const installs = await db.installedApp.findMany({ where: { listingId: listing.id } });
    expect(installs).toHaveLength(1);
  });

  it("does not create duplicate installs when two requests race", async () => {
    const listing = await createFreeAppListing();
    const installer = await createUser();
    await loginAs(installer.id);

    const results = await Promise.all([
      installApp(undefined, formData({ listingId: listing.id, installerType: "user", installerId: "" })),
      installApp(undefined, formData({ listingId: listing.id, installerType: "user", installerId: "" })),
    ]);

    const succeeded = results.filter((r) => r === undefined).length;
    expect(succeeded).toBe(1);

    const installs = await db.installedApp.findMany({ where: { listingId: listing.id } });
    expect(installs).toHaveLength(1);
  });
});
