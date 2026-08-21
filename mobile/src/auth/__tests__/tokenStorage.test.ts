const mockStore = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => (mockStore.has(key) ? mockStore.get(key)! : null)),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

import * as SecureStore from "expo-secure-store";
import { saveTokens, loadTokens, clearTokens } from "../tokenStorage";

// Regression coverage for the mobile-review finding: tokenStorage held two
// documented-but-untested invariants (partial-write cleanup, null-vs-empty-
// string handling) that a future refactor could easily break silently,
// since a broken version would still look like "it compiles" right up
// until a real device hit the exact failure path.
describe("tokenStorage", () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    // A prior test's mockImplementation override (the write-failure case
    // below) would otherwise leak into later tests — clearAllMocks resets
    // call history, not implementations.
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
      mockStore.set(key, value);
    });
  });

  it("round-trips a full token set", async () => {
    await saveTokens({ accessToken: "AT", refreshToken: "RT", expiresAt: 12345 });
    await expect(loadTokens()).resolves.toEqual({ accessToken: "AT", refreshToken: "RT", expiresAt: 12345 });
  });

  it("returns null when nothing has ever been saved", async () => {
    await expect(loadTokens()).resolves.toBeNull();
  });

  it("returns null when only some of the three keys are present", async () => {
    // Simulates a genuinely-missing session, not a corrupted one — e.g. a
    // fresh install that never signed in.
    await SecureStore.setItemAsync("0dot_access_token", "AT");
    await expect(loadTokens()).resolves.toBeNull();
  });

  it("treats a stored empty string as present, not missing", async () => {
    // The whole point of the `== null` check over a truthiness check: an
    // empty-string refresh token is a real (if degenerate) stored value,
    // not the same as "no session".
    await SecureStore.setItemAsync("0dot_access_token", "AT");
    await SecureStore.setItemAsync("0dot_refresh_token", "");
    await SecureStore.setItemAsync("0dot_token_expires_at", "999");

    await expect(loadTokens()).resolves.toEqual({ accessToken: "AT", refreshToken: "", expiresAt: 999 });
  });

  it("clears everything it wrote when one of the three writes fails", async () => {
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
      if (key === "0dot_refresh_token") throw new Error("disk full");
      mockStore.set(key, value);
    });

    await expect(saveTokens({ accessToken: "AT", refreshToken: "RT", expiresAt: 1 })).rejects.toThrow("disk full");

    // accessToken/expiresAt landed before the failure — clearTokens() must
    // have swept them too, or loadTokens would see a corrupted 2-of-3 state.
    await expect(loadTokens()).resolves.toBeNull();
    expect(mockStore.size).toBe(0);
  });

  it("clearTokens removes a previously-saved session", async () => {
    await saveTokens({ accessToken: "AT", refreshToken: "RT", expiresAt: 1 });
    await clearTokens();
    await expect(loadTokens()).resolves.toBeNull();
  });
});
