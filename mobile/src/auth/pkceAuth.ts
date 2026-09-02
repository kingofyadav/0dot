import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { API_BASE_URL, REDIRECT_URI, FIRST_PARTY_PLATFORM } from "../config";
import { fetchWithTimeout } from "../api/http";
import { saveTokens, clearTokens, loadTokens, type StoredTokens } from "./tokenStorage";

// Required once at module load so a redirect back into the app (via the
// 0dot-ios:// / 0dot-android:// scheme) actually closes the in-app browser
// tab instead of leaving it open — expo-auth-session's own setup step.
WebBrowser.maybeCompleteAuthSession();

// A sign-in that can't complete must fail loudly, not hang: promptAsync
// never resolves if the OAuth redirect can't route back into the app (the
// exact failure the withdrawn themed-icon feature caused), and
// exchangeCodeAsync's underlying fetch has no timeout of its own. Bound
// both so AuthContext's spinner always clears and the user gets a retry.
const PROMPT_TIMEOUT_MS = 5 * 60 * 1000;
const EXCHANGE_TIMEOUT_MS = 30 * 1000;

class SignInTimeoutError extends Error {}

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SignInTimeoutError(message)), ms);
  });
  return Promise.race([work, guard]).finally(() => clearTimeout(timer)) as Promise<T>;
}

// Phase 15 spec §3: the same authorization-code + PKCE flow Phase 10 built
// for third-party apps, reused as-is — /oauth/authorize is the same
// consent-screen page a third-party app's browser redirect lands on.
const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: `${API_BASE_URL}/oauth/authorize`,
  tokenEndpoint: `${API_BASE_URL}/api/oauth/token`,
};

const SCOPES = [
  "profile:read",
  "profile:write",
  "posts:read",
  "posts:write",
  "push:write",
  "notifications:read",
  "notifications:write",
  "engagement:write",
  "follows:write",
  // Mobile pro-upgrade addendum M3-M6: every scope those sub-phases' new
  // /api/v1 routes require, requested up front at sign-in — a route added
  // later without its scope added here would fail closed for every
  // already-signed-in session until the user signs out and back in, the
  // same "forgot to widen the request" class of bug this list itself is
  // fixing. businesses:write is deliberately omitted: no mobile screen
  // uses it yet (see oauth.ts's own comment on that scope), so requesting
  // it now would just be a consent-screen line item nothing here can act on.
  "messages:read",
  "messages:write",
  "communities:read",
  "communities:write",
  "businesses:read",
  "marketplace:read",
  "marketplace:write",
  "events:read",
  "events:write",
  "payments:read",
  "payments:write",
  // M12 (settings/account parity): every scope that sub-phase's new
  // /api/v1 routes require, same "request up front" reasoning as the
  // comment above — added once here rather than per already-signed-in
  // session having to be told to sign out and back in twice.
  "privacy:read",
  "privacy:write",
  "account:read",
  "account:write",
  "preferences:read",
  "preferences:write",
];

// client_id is generated per-environment (first-party-apps.ts), not a
// fixed constant this build can hardcode — discovered from the server via
// build plan step 3's new /api/oauth/first-party-clients route.
async function fetchClientId(): Promise<string> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_BASE_URL}/api/oauth/first-party-clients`);
  } catch {
    throw new Error("Could not reach 0dot. Check your connection and try again.");
  }
  if (!res.ok) throw new Error("Could not reach 0dot to start sign-in.");
  const ids = (await res.json()) as Record<string, string | null>;
  const clientId = ids[FIRST_PARTY_PLATFORM];
  if (!clientId) throw new Error("0dot hasn't registered a client for this platform yet.");
  return clientId;
}

export async function signIn(): Promise<StoredTokens> {
  const clientId = await fetchClientId();

  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri: REDIRECT_URI,
    scopes: SCOPES,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });

  let result: AuthSession.AuthSessionResult;
  try {
    result = await withTimeout(
      request.promptAsync(discovery),
      PROMPT_TIMEOUT_MS,
      "Sign-in timed out. Please try again."
    );
  } catch (err) {
    // Tear down a Custom Tab / auth session that's still open so the next
    // attempt starts clean rather than resuming the stale one.
    try {
      WebBrowser.dismissAuthSession();
    } catch {
      // iOS-only API on some SDKs — nothing to dismiss on Android.
    }
    throw err instanceof SignInTimeoutError ? err : new Error("Sign-in failed. Please try again.");
  }
  if (result.type !== "success" || !result.params.code) {
    throw new Error(result.type === "cancel" || result.type === "dismiss" ? "Sign-in was cancelled." : "Sign-in failed.");
  }

  // No clientSecret here: this app is a public client (prisma
  // DeveloperApp.isPublicClient, build plan step 3) — the token endpoint
  // accepts request.codeVerifier alone as proof of possession instead.
  const tokenResponse = await withTimeout(
    AuthSession.exchangeCodeAsync(
      {
        clientId,
        code: result.params.code,
        redirectUri: REDIRECT_URI,
        extraParams: { code_verifier: request.codeVerifier ?? "" },
      },
      discovery
    ),
    EXCHANGE_TIMEOUT_MS,
    "Sign-in timed out finishing up. Please try again."
  );

  // The server always mints a refresh token (exchangeAuthorizationCode,
  // oauth.ts) — treat a missing one as a hard failure rather than silently
  // storing "" for it, since tokenStorage.loadTokens() would then have no
  // reliable way to tell "genuinely signed out" from "signed in with a
  // blank refresh token" apart.
  if (!tokenResponse.refreshToken) throw new Error("Sign-in did not return a usable session. Please try again.");

  const tokens: StoredTokens = {
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
    expiresAt: Date.now() + (tokenResponse.expiresIn ?? 3600) * 1000,
  };
  await saveTokens(tokens);
  return tokens;
}

// Thrown by refreshAccessToken. invalidGrant distinguishes the two ways a
// refresh can fail, since callers (api/client.ts's retry-once logic) must
// react differently: a rejected refresh token (rotated away, revoked, or
// unknown) means the session is genuinely over, but a network-level
// failure (offline, timeout) says nothing about whether the still-stored
// tokens are good — clearing them on a timeout would sign someone out for
// losing wifi for a second.
export class RefreshFailedError extends Error {
  invalidGrant: boolean;
  constructor(message: string, invalidGrant: boolean) {
    super(message);
    this.invalidGrant = invalidGrant;
  }
}

// RFC 6749 §6, against the refresh_token grant oauth.ts's token route now
// implements. Reuses expo-auth-session's own refreshAsync rather than
// hand-rolling the form-encoded POST — same call shape as exchangeCodeAsync
// above, and its TokenError distinguishes "server rejected the grant" from
// a plain network failure for RefreshFailedError's invalidGrant flag.
export async function refreshAccessToken(refreshToken: string): Promise<StoredTokens> {
  const clientId = await fetchClientId();
  let response: AuthSession.TokenResponse;
  try {
    response = await AuthSession.refreshAsync({ clientId, refreshToken }, discovery);
  } catch (err) {
    throw new RefreshFailedError(
      err instanceof Error ? err.message : "Could not refresh your session.",
      err instanceof AuthSession.TokenError
    );
  }
  // Rotation (oauth.ts's refreshAccessToken) always issues a new refresh
  // token alongside the new access token — a response missing one can't be
  // trusted to keep the session renewable next time, same reasoning signIn()
  // above applies to the initial exchange.
  if (!response.refreshToken) throw new RefreshFailedError("Refresh did not return a usable session.", true);
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: Date.now() + (response.expiresIn ?? 3600) * 1000,
  };
}

export async function signOut(): Promise<void> {
  await clearTokens();
}

export async function getStoredTokens(): Promise<StoredTokens | null> {
  return loadTokens();
}
