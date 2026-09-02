import { describe, it, expect } from "vitest";
import { grantCoinsAction } from "@/app/actions/admin-wallet";
import { db } from "@/lib/db";
import { createUser, createSessionForUser } from "@/test/factories";
import { setSessionCookie } from "@/test/next-test-state";
import { NextRedirectSignal } from "@/test/next-test-state";
import { getWalletBalance } from "@/lib/wallet/ledger";

function fd(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

async function loginAs(userId: string) {
  setSessionCookie(await createSessionForUser(userId));
}

// requirePlatformRole (auth-guards.ts) is the server-side gate here — this
// route has no separate client-side check to bypass, so a non-admin caller
// must be rejected before grantCoinsAction ever looks at its formData, not
// merely hidden from the admin UI.
describe("grantCoinsAction", () => {
  it("redirects a non-admin instead of granting coins", async () => {
    const admin = await createUser();
    const target = await createUser();

    let redirected = false;
    try {
      await loginAs(admin.id); // verified user, but no PlatformRole row
      await grantCoinsAction(
        undefined,
        fd({ mode: "admin_adjustment", targetKind: "user", targetHandle: target.username!.handle, coins: "50", reason: "test" })
      );
    } catch (err) {
      if (!(err instanceof NextRedirectSignal)) throw err;
      redirected = true;
    }

    expect(redirected).toBe(true);
    const balance = await getWalletBalance(target.id);
    expect(balance.spendable).toBe(0);
  });

  it("grants coins for a caller with the admin platform role", async () => {
    const admin = await createUser();
    await db.platformRole.create({ data: { userId: admin.id, role: "admin" } });
    const target = await createUser();
    await loginAs(admin.id);

    const result = await grantCoinsAction(
      undefined,
      fd({ mode: "admin_adjustment", targetKind: "user", targetHandle: target.username!.handle, coins: "50", reason: "test grant" })
    );

    expect(result).toEqual({ success: true });
    const balance = await getWalletBalance(target.id);
    expect(balance.spendable).toBe(50);
  });

  it("rejects an unrecognized target username without granting anything", async () => {
    const admin = await createUser();
    await db.platformRole.create({ data: { userId: admin.id, role: "admin" } });
    await loginAs(admin.id);

    const result = await grantCoinsAction(
      undefined,
      fd({ mode: "admin_adjustment", targetKind: "user", targetHandle: "no-such-user-handle", coins: "50", reason: "test" })
    );

    expect(result?.error).toBeTruthy();
  });
});
