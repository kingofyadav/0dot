import { describe, it, expect } from "vitest";
import { login } from "@/app/actions/auth";
import { createUser } from "@/test/factories";
import { headerJar } from "@/test/next-test-state";

const PASSWORD = "correct-horse-battery-staple";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

// Regression coverage for BUGS.md #1 ("Login doesn't check account status")
// and #2/#10 ("User-enumeration timing side-channel").
describe("login", () => {
  it("rejects a suspended account even with the correct password", async () => {
    headerJar.set("x-forwarded-for", "10.0.0.1");
    const user = await createUser({ status: "suspended" });
    const result = await login(undefined, formData({ identifier: user.email, password: PASSWORD }));
    expect(result?.error).toBe("This account is no longer active.");
  });

  it("returns the same generic error for a nonexistent email as for a wrong password", async () => {
    headerJar.set("x-forwarded-for", "10.0.0.2");
    const existing = await createUser();
    const wrongPassword = await login(undefined, formData({ identifier: existing.email, password: "wrong-password" }));

    headerJar.set("x-forwarded-for", "10.0.0.3");
    const noSuchUser = await login(undefined, formData({ identifier: "nobody-here@example.com", password: "wrong-password" }));

    expect(wrongPassword?.error).toBe("Incorrect email/username/mobile number or password.");
    expect(noSuchUser?.error).toBe(wrongPassword?.error);
  });

  // 11 sequential logins, each firing two enforceRateLimit() calls against
  // the durable (RateLimitCounter/SQLite) tier — ~66 serialized writes plus
  // bcrypt. That runs well past vitest's 5s default on a loaded machine even
  // though the logic is fine, so this one test gets explicit headroom. (In
  // production the Redis tier makes this path a single round trip.)
  it("rate-limits repeated attempts from the same IP", async () => {
    headerJar.set("x-forwarded-for", "10.0.0.4");
    for (let i = 0; i < 10; i++) {
      await login(undefined, formData({ identifier: `nope-${i}@example.com`, password: "x" }));
    }
    const blocked = await login(undefined, formData({ identifier: "nope-final@example.com", password: "x" }));
    expect(blocked?.error).toMatch(/too many attempts/i);
  }, 20_000);
});
