import { describe, it, expect, vi } from "vitest";
import { runWithDbResilience, wrapLibsqlExecutor, isTransientLibsqlError } from "@/lib/db-resilience";

function serverError(status = 503) {
  const err = new Error(`Server returned HTTP status ${status}`) as Error & { code: string; cause: { status: number } };
  err.code = "SERVER_ERROR";
  err.cause = { status };
  return err;
}

describe("isTransientLibsqlError", () => {
  it("recognizes a SERVER_ERROR-coded LibsqlError", () => {
    expect(isTransientLibsqlError(serverError())).toBe(true);
  });

  it("recognizes any error whose cause carries a 5xx status", () => {
    const err = new Error("boom") as Error & { cause: { status: number } };
    err.cause = { status: 502 };
    expect(isTransientLibsqlError(err)).toBe(true);
  });

  it("rejects a plain constraint-violation style error", () => {
    const err = new Error("UNIQUE constraint failed") as Error & { code: string };
    err.code = "SQLITE_CONSTRAINT";
    expect(isTransientLibsqlError(err)).toBe(false);
  });

  it("rejects non-Error values", () => {
    expect(isTransientLibsqlError("nope")).toBe(false);
  });

  // Production shape: undici's fetch throws a generic TypeError wrapping the
  // real socket error as .cause — no libsql error code to key off, unlike
  // SERVER_ERROR above.
  function fetchFailed(causeCode: string, causeMessage = causeCode) {
    const cause = new Error(causeMessage) as Error & { code: string };
    cause.code = causeCode;
    const err = new TypeError("fetch failed") as TypeError & { cause: Error };
    err.cause = cause;
    return err;
  }

  it("recognizes a connect ETIMEDOUT wrapped in a fetch failed TypeError", () => {
    expect(isTransientLibsqlError(fetchFailed("ETIMEDOUT", "connect ETIMEDOUT 13.207.22.218:443"))).toBe(true);
  });

  it("recognizes a socket reset (UND_ERR_SOCKET) wrapped in a fetch failed TypeError", () => {
    expect(isTransientLibsqlError(fetchFailed("UND_ERR_SOCKET", "other side closed"))).toBe(true);
  });

  it("rejects a fetch failed TypeError whose cause isn't a known transient network code", () => {
    expect(isTransientLibsqlError(fetchFailed("ERR_INVALID_URL"))).toBe(false);
  });
});

describe("runWithDbResilience", () => {
  it("retries a transient error and returns the eventual success", async () => {
    let calls = 0;
    const result = await runWithDbResilience(async () => {
      calls++;
      if (calls < 3) throw serverError();
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry a non-transient error", async () => {
    let calls = 0;
    await expect(
      runWithDbResilience(async () => {
        calls++;
        throw new Error("not transient");
      }),
    ).rejects.toThrow("not transient");
    expect(calls).toBe(1);
  });

  it("gives up after the retry budget and surfaces the last error", async () => {
    let calls = 0;
    await expect(
      runWithDbResilience(async () => {
        calls++;
        throw serverError();
      }),
    ).rejects.toThrow(/HTTP status 503/);
    expect(calls).toBe(6); // 1 initial attempt + 5 retries (MAX_RETRIES)
  });

  it("caps how many callbacks run concurrently", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const task = async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight--;
      return "done";
    };
    const results = await Promise.all(Array.from({ length: 20 }, () => runWithDbResilience(task)));
    expect(results).toEqual(Array(20).fill("done"));
    expect(maxInFlight).toBeLessThanOrEqual(8); // default MAX_CONCURRENT_QUERIES
  });
});

describe("wrapLibsqlExecutor", () => {
  it("retries execute() on a transient error", async () => {
    let calls = 0;
    const target = {
      execute: vi.fn(async () => {
        calls++;
        if (calls < 2) throw serverError();
        return { rows: [] };
      }),
    };
    const wrapped = wrapLibsqlExecutor(target);
    await expect(wrapped.execute()).resolves.toEqual({ rows: [] });
    expect(calls).toBe(2);
  });

  it("wraps the object transaction() resolves to, so its execute/batch also retry", async () => {
    let txExecuteCalls = 0;
    const tx = {
      execute: vi.fn(async () => {
        txExecuteCalls++;
        if (txExecuteCalls < 2) throw serverError();
        return { rows: [] };
      }),
      commit: vi.fn(async () => "committed"),
    };
    const target = { transaction: vi.fn(async () => tx) };
    const wrapped = wrapLibsqlExecutor(target);
    const wrappedTx = await wrapped.transaction();
    await expect(wrappedTx.execute()).resolves.toEqual({ rows: [] });
    expect(txExecuteCalls).toBe(2);
    // commit is passed through unwrapped/unretried — never touched above.
    await expect(wrappedTx.commit()).resolves.toBe("committed");
  });

  it("binds passthrough methods to the real target so private-style state still works", async () => {
    class Real {
      #count = 0;
      bump() {
        this.#count++;
        return this.#count;
      }
    }
    const wrapped = wrapLibsqlExecutor(new Real());
    const bump = wrapped.bump;
    expect(bump()).toBe(1);
    expect(bump()).toBe(2);
  });
});
