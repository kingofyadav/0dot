jest.mock("../pkceAuth", () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  getStoredTokens: jest.fn(),
}));

jest.mock("../biometricLock", () => ({
  isBiometricLockAvailable: jest.fn(),
  unlockWithBiometrics: jest.fn(),
}));

// Defined entirely inside the factory (no outside reference) so it isn't
// subject to jest.mock's hoist-above-everything-else ordering — same
// pattern client.test.ts already uses for a mocked ApiError-shaped class.
jest.mock("../../api/client", () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { getMe: jest.fn(), ApiError };
});

jest.mock("../../push/registerPush", () => ({
  registerForPushNotificationsAsync: jest.fn(),
}));

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AuthProvider, useAuth } from "../AuthContext";
import { signIn as pkceSignIn, signOut as pkceSignOut, getStoredTokens } from "../pkceAuth";
import { isBiometricLockAvailable, unlockWithBiometrics } from "../biometricLock";
import { getMe, ApiError } from "../../api/client";
import { registerForPushNotificationsAsync } from "../../push/registerPush";
import type { StoredTokens } from "../tokenStorage";

const mockGetStoredTokens = getStoredTokens as jest.Mock;
const mockPkceSignIn = pkceSignIn as jest.Mock;
const mockPkceSignOut = pkceSignOut as jest.Mock;
const mockIsBiometricAvailable = isBiometricLockAvailable as jest.Mock;
const mockUnlockWithBiometrics = unlockWithBiometrics as jest.Mock;
const mockGetMe = getMe as jest.Mock;
const mockRegisterPush = registerForPushNotificationsAsync as jest.Mock;

const TOKENS: StoredTokens = { accessToken: "AT1", refreshToken: "RT1", expiresAt: Date.now() + 999_999 };
const ME = { id: "u1", username: "amit" };

// AuthProvider's mount effect does async work (getStoredTokens, then
// getMe) beyond what renderHook's own initial act() flushes, so the
// render itself needs to run inside `act()` — matching the pattern
// react-testing-library documents for effects that keep updating state
// after mount — or later setState calls land outside any act scope and
// React logs "environment not configured to support act" instead of
// letting the updates land normally.
async function renderAuth() {
  let rendered!: Awaited<ReturnType<typeof renderHook<ReturnType<typeof useAuth>, unknown>>>;
  await act(async () => {
    rendered = await renderHook(() => useAuth(), { wrapper: AuthProvider });
  });
  return rendered;
}

// Regression coverage for AuthContext's status state machine (loading ->
// locked/signedOut/signedIn), the biometric-availability branch on restore,
// the 401-on-restore sign-out path, and the push-registration dedup/reset —
// none of which pkceAuth.test.ts or client.test.ts's lower-level tests
// exercise, since those only cover the token-refresh logic AuthContext
// calls into, not the state machine built on top of it.
describe("AuthProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMe.mockResolvedValue(ME);
    mockRegisterPush.mockResolvedValue(undefined);
  });

  it("restores a signed-in session directly when biometrics aren't available", async () => {
    mockGetStoredTokens.mockResolvedValue(TOKENS);
    mockIsBiometricAvailable.mockResolvedValue(false);

    const { result } = await renderAuth();

    await waitFor(() => expect(result.current.status).toBe("signedIn"));
    expect(result.current.me).toEqual(ME);
    expect(mockRegisterPush).toHaveBeenCalledTimes(1);
  });

  it("locks a restored session when biometrics are available, and unlock() completes it", async () => {
    mockGetStoredTokens.mockResolvedValue(TOKENS);
    mockIsBiometricAvailable.mockResolvedValue(true);
    mockUnlockWithBiometrics.mockResolvedValue(true);

    const { result } = await renderAuth();

    await waitFor(() => expect(result.current.status).toBe("locked"));
    expect(mockGetMe).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.unlock();
    });

    expect(result.current.status).toBe("signedIn");
    expect(mockRegisterPush).toHaveBeenCalledTimes(1);
  });

  it("sets an error and stays locked when biometric unlock fails", async () => {
    mockGetStoredTokens.mockResolvedValue(TOKENS);
    mockIsBiometricAvailable.mockResolvedValue(true);
    mockUnlockWithBiometrics.mockResolvedValue(false);

    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.status).toBe("locked"));

    await act(async () => {
      await result.current.unlock();
    });

    expect(result.current.status).toBe("locked");
    expect(result.current.error).toBe("Unlock failed.");
  });

  it("has no session to restore -> signedOut, then signIn() reaches signedIn", async () => {
    mockGetStoredTokens.mockResolvedValue(null);

    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.status).toBe("signedOut"));

    mockPkceSignIn.mockResolvedValue(TOKENS);
    await act(async () => {
      await result.current.signIn();
    });

    expect(result.current.status).toBe("signedIn");
    expect(result.current.me).toEqual(ME);
  });

  it("signs the user out with a session-expired error when restore's getMe returns a 401", async () => {
    mockGetStoredTokens.mockResolvedValue(TOKENS);
    mockIsBiometricAvailable.mockResolvedValue(false);
    mockGetMe.mockRejectedValue(new ApiError("Invalid or expired access token.", 401));

    const { result } = await renderAuth();

    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    expect(result.current.error).toBe("Your session expired. Please sign in again.");
    expect(mockPkceSignOut).toHaveBeenCalledTimes(1);
  });

  it("signOut() clears tokens/me and resets push registration so a later signIn() re-registers", async () => {
    mockGetStoredTokens.mockResolvedValue(TOKENS);
    mockIsBiometricAvailable.mockResolvedValue(false);

    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.status).toBe("signedIn"));
    expect(mockRegisterPush).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.status).toBe("signedOut");
    expect(result.current.me).toBeNull();
    expect(mockPkceSignOut).toHaveBeenCalledTimes(1);

    mockPkceSignIn.mockResolvedValue(TOKENS);
    await act(async () => {
      await result.current.signIn();
    });

    // A stale-false ref after sign-out would silently skip push
    // re-registration for the entire next session.
    expect(mockRegisterPush).toHaveBeenCalledTimes(2);
  });
});
