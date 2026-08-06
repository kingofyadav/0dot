import { describe, it, expect } from "vitest";
import { getCurrentUser } from "@/lib/session";
import { createUser, createSessionForUser } from "@/test/factories";
import { setSessionCookie } from "@/test/next-test-state";
import { db } from "@/lib/db";

// Regression coverage for the getCurrentUser() half of BUGS.md #1: a
// session issued while the account was active must stop working the
// moment the account is suspended/deactivated/deleted, not just block a
// fresh login.
describe("getCurrentUser", () => {
  it("returns null and deletes the session once the account is suspended", async () => {
    const user = await createUser();
    const token = await createSessionForUser(user.id);
    setSessionCookie(token);

    await db.user.update({ where: { id: user.id }, data: { status: "suspended" } });

    const result = await getCurrentUser();
    expect(result).toBeNull();

    const sessionRow = await db.session.findUnique({ where: { token } });
    expect(sessionRow).toBeNull();
  });

  it("returns the user for a still-active session", async () => {
    const user = await createUser();
    const token = await createSessionForUser(user.id);
    setSessionCookie(token);

    const result = await getCurrentUser();
    expect(result?.id).toBe(user.id);
  });
});
