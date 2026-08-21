jest.mock("../http", () => ({
  fetchWithTimeout: jest.fn(),
  isAbortError: () => false,
}));

// Defined entirely inside the factory (no outside reference) so it isn't
// subject to jest.mock's hoist-above-everything-else ordering.
jest.mock("../../auth/pkceAuth", () => {
  class RefreshFailedError extends Error {
    invalidGrant: boolean;
    constructor(message: string, invalidGrant: boolean) {
      super(message);
      this.invalidGrant = invalidGrant;
    }
  }
  return { refreshAccessToken: jest.fn(), RefreshFailedError };
});

jest.mock("../../auth/tokenStorage", () => ({
  loadTokens: jest.fn(),
  saveTokens: jest.fn(),
  clearTokens: jest.fn(),
}));

import { fetchWithTimeout } from "../http";
import { refreshAccessToken, RefreshFailedError } from "../../auth/pkceAuth";
import { loadTokens, saveTokens, clearTokens } from "../../auth/tokenStorage";
import { getMe, ApiError } from "../client";
import type { StoredTokens } from "../../auth/tokenStorage";

const mockFetch = fetchWithTimeout as jest.Mock;
const mockRefresh = refreshAccessToken as jest.Mock;
const mockLoad = loadTokens as jest.Mock;
const mockSave = saveTokens as jest.Mock;
const mockClear = clearTokens as jest.Mock;

function fakeResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

// Backs loadTokens/saveTokens/clearTokens with a shared mutable slot instead
// of hand-sequenced mockResolvedValueOnce chains — authorizedRequest calls
// loadTokens() multiple times per request (once up front, again inside a
// refresh attempt, again on retry), and pinning the exact call count would
// make these tests break on harmless implementation changes rather than on
// real behavior changes.
let current: StoredTokens | null;

// Regression coverage for the mobile-review finding: sessions used to die
// silently after the 1-hour access-token lifetime because no refresh grant
// existed. authorizedRequest (client.ts) now tries one silent
// refresh-and-retry on a 401, with concurrent 401s sharing a single
// refresh attempt — these tests exercise that logic directly rather than
// through a real network/SecureStore round trip.
describe("authorizedRequest 401 handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    current = { accessToken: "AT1", refreshToken: "RT1", expiresAt: 0 };
    mockLoad.mockImplementation(async () => current);
    mockSave.mockImplementation(async (tokens: StoredTokens) => {
      current = tokens;
    });
    mockClear.mockImplementation(async () => {
      current = null;
    });
  });

  it("returns the response directly when the access token is still good", async () => {
    mockFetch.mockResolvedValueOnce(fakeResponse(200, { id: "me" }));

    await expect(getMe()).resolves.toEqual({ id: "me" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("refreshes once and retries with the new access token after a 401", async () => {
    mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      if (headers.Authorization === "Bearer AT1") return fakeResponse(401, { error: "expired" });
      if (headers.Authorization === "Bearer AT2") return fakeResponse(200, { id: "me" });
      throw new Error(`unexpected token in request: ${headers.Authorization}`);
    });
    mockRefresh.mockResolvedValue({ accessToken: "AT2", refreshToken: "RT2", expiresAt: Date.now() + 999_999 });

    await expect(getMe()).resolves.toEqual({ id: "me" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledWith("RT1");
    expect(mockSave).toHaveBeenCalledWith({ accessToken: "AT2", refreshToken: "RT2", expiresAt: expect.any(Number) });
  });

  it("surfaces the server's original 401 and clears the session when the refresh token itself is rejected", async () => {
    mockFetch.mockResolvedValue(fakeResponse(401, { error: "Invalid or expired access token." }));
    mockRefresh.mockRejectedValue(new RefreshFailedError("rejected", true));

    await expect(getMe()).rejects.toMatchObject({ message: "Invalid or expired access token.", status: 401 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it("does not clear the session when the refresh attempt fails for a network reason", async () => {
    mockFetch.mockResolvedValue(fakeResponse(401, { error: "Invalid or expired access token." }));
    mockRefresh.mockRejectedValue(new RefreshFailedError("offline", false));

    await expect(getMe()).rejects.toThrow(ApiError);
    expect(mockClear).not.toHaveBeenCalled();
  });

  it("shares a single refresh attempt across concurrent 401s instead of racing the rotation", async () => {
    let refreshCalls = 0;
    mockRefresh.mockImplementation(async () => {
      refreshCalls += 1;
      // Small delay so both concurrent requests are genuinely in flight
      // together when refresh resolves, not accidentally serialized.
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { accessToken: "AT2", refreshToken: "RT2", expiresAt: Date.now() + 999_999 };
    });
    mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      if (headers.Authorization === "Bearer AT1") return fakeResponse(401, {});
      return fakeResponse(200, { id: "me" });
    });

    const [a, b] = await Promise.all([getMe(), getMe()]);

    expect(a).toEqual({ id: "me" });
    expect(b).toEqual({ id: "me" });
    expect(refreshCalls).toBe(1);
  });
});
