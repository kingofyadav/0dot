import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { ensureFirstPartyApps, isFirstPartyOwner } from "@/lib/first-party-apps";
import { resolveApprovableScopes } from "@/lib/oauth";
import { createUser } from "@/test/factories";

// Regression coverage for the "Can't authorize this app — This app isn't
// approved to request: ..." bug: instrumentation.ts's register() used to be
// one flat await chain, so an earlier scheduler throwing aborted
// ensureFirstPartyApps() for the rest of that server instance's life, and
// oauth/authorize/page.tsx had no fallback — first-party sign-in stayed
// broken until the next successful boot. Fixed by (1) running
// ensureFirstPartyApps() first and independently in instrumentation.ts, and
// (2) having the authorize page self-heal once, scoped to first-party apps
// only via isFirstPartyOwner.
describe("first-party app OAuth scope backfill", () => {
  it("approves every catalog scope for the Android app on a normal boot", async () => {
    await ensureFirstPartyApps();
    const app = await db.developerApp.findFirstOrThrow({ where: { name: "0dot Android App" } });

    const requested = ["profile:write", "notifications:read", "notifications:write", "engagement:write", "follows:write"];
    const result = await resolveApprovableScopes(app.id, JSON.stringify(requested));

    expect("scopes" in result && result.scopes.sort()).toEqual(requested.sort());
  });

  it("reproduces the prod bug, then self-heals the same way the authorize page does", async () => {
    await ensureFirstPartyApps();
    const app = await db.developerApp.findFirstOrThrow({ where: { name: "0dot Android App" } });

    // Simulate a boot where ensureFirstPartyApps() never ran for this app
    // (the exact state that produced the "isn't approved" error live).
    await db.developerAppScope.deleteMany({ where: { appId: app.id } });

    const requested = ["profile:write", "notifications:read"];
    const broken = await resolveApprovableScopes(app.id, JSON.stringify(requested));
    expect("error" in broken && broken.error).toMatch(/isn't approved to request/);

    // authorize/page.tsx's fallback: only self-heals when the app is
    // first-party, then retries once.
    expect(await isFirstPartyOwner(app.ownerUserId)).toBe(true);
    await ensureFirstPartyApps();
    const healed = await resolveApprovableScopes(app.id, JSON.stringify(requested));
    expect("scopes" in healed && healed.scopes.sort()).toEqual(requested.sort());
  });

  it("never self-heals a third-party app's unapproved scope", async () => {
    const owner = await createUser();
    const thirdParty = await db.developerApp.create({
      data: {
        ownerType: "user",
        ownerUserId: owner.id,
        name: "Some Third-Party App",
        description: "not 0dot's own app",
        clientId: `client_${crypto.randomUUID()}`,
        clientSecretHash: "unused",
        isPublicClient: true,
        redirectUrisJson: JSON.stringify(["https://example.com/callback"]),
      },
    });

    expect(await isFirstPartyOwner(thirdParty.ownerUserId)).toBe(false);

    const result = await resolveApprovableScopes(thirdParty.id, JSON.stringify(["profile:write"]));
    expect("error" in result && result.error).toMatch(/isn't approved to request/);

    // Even if ensureFirstPartyApps() runs again, it must never touch a
    // third-party app's scopes — the failure above must stay failed closed.
    await ensureFirstPartyApps();
    const stillBroken = await resolveApprovableScopes(thirdParty.id, JSON.stringify(["profile:write"]));
    expect("error" in stillBroken && stillBroken.error).toMatch(/isn't approved to request/);
  });
});
