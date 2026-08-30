import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { enforceRateLimit, checkRateLimit } from "@/lib/rate-limit";

// vitest.config.ts forces KV_REST_API_* empty, so enforceRateLimit here
// exercises the RateLimitCounter (Turso/SQLite) tier — the durable
// fallback. The Redis tier is covered by a smoke check on a real deploy.

describe("enforceRateLimit (durable tier)", () => {
  it("allows exactly `max` requests in a window, then blocks", async () => {
    const key = `rl-test:${randomUUID()}`;
    const opts = { max: 3, windowMs: 60_000 };

    expect(await enforceRateLimit(key, opts)).toBe(true);
    expect(await enforceRateLimit(key, opts)).toBe(true);
    expect(await enforceRateLimit(key, opts)).toBe(true);
    expect(await enforceRateLimit(key, opts)).toBe(false);
    expect(await enforceRateLimit(key, opts)).toBe(false);
  });

  it("rolls a window over once it expires", async () => {
    const key = `rl-test:${randomUUID()}`;
    const opts = { max: 1, windowMs: 300 };

    expect(await enforceRateLimit(key, opts)).toBe(true);
    expect(await enforceRateLimit(key, opts)).toBe(false);

    await new Promise((r) => setTimeout(r, 550));

    expect(await enforceRateLimit(key, opts)).toBe(true);
  }, 15_000);

  it("does not let concurrent requests slip past `max`", async () => {
    const key = `rl-test:${randomUUID()}`;
    const opts = { max: 5, windowMs: 60_000 };

    const results = await Promise.all(
      Array.from({ length: 15 }, () => enforceRateLimit(key, opts)),
    );

    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it("keeps distinct keys independent", async () => {
    const a = `rl-test:${randomUUID()}`;
    const b = `rl-test:${randomUUID()}`;
    const opts = { max: 1, windowMs: 60_000 };

    expect(await enforceRateLimit(a, opts)).toBe(true);
    expect(await enforceRateLimit(b, opts)).toBe(true);
    expect(await enforceRateLimit(a, opts)).toBe(false);
  });
});

describe("checkRateLimit (in-memory tier)", () => {
  it("allows `max` then blocks within the window", () => {
    const key = `mem-test:${randomUUID()}`;
    const opts = { max: 2, windowMs: 60_000 };

    expect(checkRateLimit(key, opts)).toBe(true);
    expect(checkRateLimit(key, opts)).toBe(true);
    expect(checkRateLimit(key, opts)).toBe(false);
  });
});
