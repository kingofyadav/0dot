jest.mock("../../api/http", () => ({
  fetchWithTimeout: jest.fn(),
  isAbortError: () => false,
}));

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  dismissAuthSession: jest.fn(),
}));

jest.mock("../tokenStorage", () => ({
  saveTokens: jest.fn(),
  clearTokens: jest.fn(),
  loadTokens: jest.fn(),
}));

// A minimal stand-in for expo-auth-session's real TokenError (which the
// real class needs an RFC 6749 error-code params object to construct) —
// pkceAuth.ts only ever does `instanceof AuthSession.TokenError` on it, so
// a bare Error subclass is all this needs to be to test that check.
jest.mock("expo-auth-session", () => {
  class TokenError extends Error {}
  return {
    refreshAsync: jest.fn(),
    exchangeCodeAsync: jest.fn(),
    AuthRequest: jest.fn(),
    ResponseType: { Code: "code" },
    TokenError,
  };
});

import * as AuthSession from "expo-auth-session";
import { fetchWithTimeout } from "../../api/http";
import { saveTokens } from "../tokenStorage";
import { signIn, refreshAccessToken, RefreshFailedError } from "../pkceAuth";

const mockFetch = fetchWithTimeout as jest.Mock;
const mockRefreshAsync = AuthSession.refreshAsync as jest.Mock;
const mockAuthRequest = AuthSession.AuthRequest as unknown as jest.Mock;
const mockExchangeCode = AuthSession.exchangeCodeAsync as jest.Mock;
const mockSaveTokens = saveTokens as jest.Mock;

function mockClientIdLookup() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ ios: "client-1", android: "client-1", desktop: null }),
  } as Response);
}

// Regression coverage for the mobile-review finding: refreshAccessToken's
// invalidGrant classification is what api/client.ts relies on to decide
// "sign the user out" vs. "just retry later" — getting this backwards in
// either direction is either a spurious sign-out on a flaky connection or a
// session that never actually recovers from a truly dead refresh token.
describe("refreshAccessToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns fresh tokens on a successful refresh", async () => {
    mockClientIdLookup();
    mockRefreshAsync.mockResolvedValue({ accessToken: "AT2", refreshToken: "RT2", expiresIn: 3600 });

    const tokens = await refreshAccessToken("RT1");

    expect(tokens.accessToken).toBe("AT2");
    expect(tokens.refreshToken).toBe("RT2");
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
  });

  it("marks a TokenError (server rejected the grant) as invalidGrant", async () => {
    mockClientIdLookup();
    mockRefreshAsync.mockRejectedValue(new AuthSession.TokenError({ error: "invalid_grant" }));

    const err = await refreshAccessToken("RT1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RefreshFailedError);
    expect((err as RefreshFailedError).invalidGrant).toBe(true);
  });

  it("does not mark a plain network error as invalidGrant", async () => {
    mockClientIdLookup();
    mockRefreshAsync.mockRejectedValue(new Error("network down"));

    const err = await refreshAccessToken("RT1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RefreshFailedError);
    expect((err as RefreshFailedError).invalidGrant).toBe(false);
  });

  it("treats a response missing a new refresh token as invalidGrant", async () => {
    mockClientIdLookup();
    mockRefreshAsync.mockResolvedValue({ accessToken: "AT2", refreshToken: undefined, expiresIn: 3600 });

    const err = await refreshAccessToken("RT1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RefreshFailedError);
    expect((err as RefreshFailedError).invalidGrant).toBe(true);
  });

  it("propagates a plain error, not RefreshFailedError, when the client-id lookup itself fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("offline"));

    const err = await refreshAccessToken("RT1").catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(RefreshFailedError);
  });
});

// Regression coverage for the "sign-in did nothing" failure: promptAsync
// never resolves when the OAuth redirect can't route back into the app, and
// exchangeCodeAsync's fetch has no timeout — either one would otherwise
// strand AuthContext on its loading spinner indefinitely.
describe("signIn timeouts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockClientIdLookup();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function mockAuthRequestWith(promptAsync: jest.Mock) {
    mockAuthRequest.mockImplementation(() => ({ promptAsync, codeVerifier: "verifier" }));
  }

  it("rejects when the browser prompt never returns", async () => {
    mockAuthRequestWith(jest.fn().mockReturnValue(new Promise(() => {})));

    const settled = signIn().then(
      () => ({ ok: true }),
      (e: Error) => ({ ok: false, message: e.message })
    );

    await jest.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);

    expect(await settled).toEqual({ ok: false, message: "Sign-in timed out. Please try again." });
    expect(mockSaveTokens).not.toHaveBeenCalled();
  });

  it("rejects when the token exchange hangs", async () => {
    mockAuthRequestWith(jest.fn().mockResolvedValue({ type: "success", params: { code: "auth-code" } }));
    mockExchangeCode.mockReturnValue(new Promise(() => {}));

    const settled = signIn().then(
      () => ({ ok: true }),
      (e: Error) => ({ ok: false, message: e.message })
    );

    await jest.advanceTimersByTimeAsync(30 * 1000 + 1);

    expect(await settled).toEqual({
      ok: false,
      message: "Sign-in timed out finishing up. Please try again.",
    });
    expect(mockSaveTokens).not.toHaveBeenCalled();
  });

  it("completes and stores tokens on the happy path", async () => {
    mockAuthRequestWith(jest.fn().mockResolvedValue({ type: "success", params: { code: "auth-code" } }));
    mockExchangeCode.mockResolvedValue({ accessToken: "AT", refreshToken: "RT", expiresIn: 3600 });

    const tokens = await signIn();

    expect(tokens.accessToken).toBe("AT");
    expect(tokens.refreshToken).toBe("RT");
    expect(mockSaveTokens).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "AT", refreshToken: "RT" }));
  });
});
