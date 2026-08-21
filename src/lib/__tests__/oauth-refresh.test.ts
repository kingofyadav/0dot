import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { issueAuthorizationCode, exchangeAuthorizationCode, refreshAccessToken, revokeOAuthAuthorization, hashApiToken } from "@/lib/oauth";
import { createUser } from "@/test/factories";

async function createPublicClientApp(ownerId: string) {
  return db.developerApp.create({
    data: {
      ownerType: "user",
      ownerUserId: ownerId,
      name: "Refresh Grant Test App",
      description: "test",
      clientId: `client_${crypto.randomUUID()}`,
      clientSecretHash: "unused",
      isPublicClient: true,
      redirectUrisJson: JSON.stringify(["https://example.com/callback"]),
    },
  });
}

async function issueInitialTokens(appId: string, userId: string) {
  // codeChallengeMethod "plain" (verifyPkce accepts it) sidesteps computing
  // a real S256 challenge for a test that isn't about PKCE itself.
  const code = await issueAuthorizationCode({
    appId,
    userId,
    redirectUri: "https://example.com/callback",
    approvedScopes: ["profile:read"],
    codeChallenge: "verifier123",
    codeChallengeMethod: "plain",
  });
  const result = await exchangeAuthorizationCode({ code, codeVerifier: "verifier123", redirectUri: "https://example.com/callback", appId });
  if ("error" in result) throw new Error(result.error);
  return result;
}

// Regression coverage for the mobile-review finding: the token route used
// to only implement grant_type=authorization_code, so a stored refresh
// token was dead weight and every session silently died after the 1-hour
// access-token lifetime. refreshAccessToken (oauth.ts) plus the route's new
// refresh_token branch are the fix — this covers rotation, single-use, and
// the two fail-closed paths (cross-app reuse, revoked authorization).
describe("OAuth refresh_token grant", () => {
  it("issues a new access/refresh pair and invalidates the old one", async () => {
    const user = await createUser();
    const app = await createPublicClientApp(user.id);
    const initial = await issueInitialTokens(app.id, user.id);

    const refreshed = await refreshAccessToken({ refreshToken: initial.refreshToken, appId: app.id });
    if ("error" in refreshed) throw new Error(refreshed.error);

    expect(refreshed.accessToken).not.toBe(initial.accessToken);
    expect(refreshed.refreshToken).not.toBe(initial.refreshToken);
    expect(refreshed.scope).toBe(initial.scope);

    expect(await db.oAuthToken.findUnique({ where: { accessTokenHash: hashApiToken(initial.accessToken) } })).toBeNull();
    expect(await db.oAuthToken.findUnique({ where: { accessTokenHash: hashApiToken(refreshed.accessToken) } })).not.toBeNull();
  });

  it("rejects reuse of an already-rotated-away refresh token", async () => {
    const user = await createUser();
    const app = await createPublicClientApp(user.id);
    const initial = await issueInitialTokens(app.id, user.id);

    await refreshAccessToken({ refreshToken: initial.refreshToken, appId: app.id });
    const reused = await refreshAccessToken({ refreshToken: initial.refreshToken, appId: app.id });

    expect("error" in reused && reused.error).toMatch(/Invalid refresh token/);
  });

  it("rejects a refresh token presented against a different app", async () => {
    const user = await createUser();
    const app = await createPublicClientApp(user.id);
    const otherApp = await createPublicClientApp(user.id);
    const initial = await issueInitialTokens(app.id, user.id);

    const result = await refreshAccessToken({ refreshToken: initial.refreshToken, appId: otherApp.id });

    expect("error" in result && result.error).toMatch(/Invalid refresh token/);
  });

  it("fails closed once the authorization has been revoked", async () => {
    const user = await createUser();
    const app = await createPublicClientApp(user.id);
    const initial = await issueInitialTokens(app.id, user.id);

    const authorization = await db.oAuthAuthorization.findFirstOrThrow({ where: { appId: app.id, userId: user.id } });
    await revokeOAuthAuthorization(authorization.id, user.id);

    const result = await refreshAccessToken({ refreshToken: initial.refreshToken, appId: app.id });

    expect("error" in result).toBe(true);
  });
});
