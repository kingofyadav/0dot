import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createUser } from "@/test/factories";
import { issueAuthorizationCode, exchangeAuthorizationCode } from "@/lib/oauth";
import { GET as getTrust } from "@/app/api/v1/users/me/trust/route";

async function createPublicClientApp(ownerId: string) {
  return db.developerApp.create({
    data: {
      ownerType: "user",
      ownerUserId: ownerId,
      name: "Trust Route Test App",
      description: "test",
      clientId: `client_${randomUUID()}`,
      clientSecretHash: "unused",
      isPublicClient: true,
      redirectUrisJson: JSON.stringify(["https://example.com/callback"]),
    },
  });
}

async function authorizedRequest(viewerId: string, scopes: string[]) {
  const app = await createPublicClientApp(viewerId);
  const code = await issueAuthorizationCode({
    appId: app.id,
    userId: viewerId,
    redirectUri: "https://example.com/callback",
    approvedScopes: scopes,
    codeChallenge: "verifier123",
    codeChallengeMethod: "plain",
  });
  const result = await exchangeAuthorizationCode({ code, codeVerifier: "verifier123", redirectUri: "https://example.com/callback", appId: app.id });
  if ("error" in result) throw new Error(result.error);
  return new Request("https://0dot.in/api/v1/users/me/trust", {
    headers: { Authorization: `Bearer ${result.accessToken}` },
  });
}

describe("GET /api/v1/users/me/trust", () => {
  it("403s without the trust:read scope granted", async () => {
    const user = await createUser();
    const req = await authorizedRequest(user.id, ["profile:read"]);
    const res = await getTrust(req);
    expect(res.status).toBe(403);
  });

  it("401s with no Authorization header", async () => {
    const res = await getTrust(new Request("https://0dot.in/api/v1/users/me/trust"));
    expect(res.status).toBe(401);
  });

  it("returns exactly the documented claims, with email/2FA/age unverified by default", async () => {
    const user = await createUser({ emailVerifiedAt: null });
    const req = await authorizedRequest(user.id, ["trust:read"]);
    const res = await getTrust(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: user.id,
      emailVerified: false,
      twoFactorEnabled: false,
      accountStatus: "active",
      accountAgeDays: expect.any(Number),
      ageVerified: false,
      asOf: expect.any(String),
    });
    expect(body.phoneVerified).toBeUndefined();
  });

  it("reflects verified email, 2FA, and age once set", async () => {
    const user = await createUser({ emailVerifiedAt: new Date() });
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorEnabledAt: new Date(), ageVerifiedAt: new Date() },
    });
    const req = await authorizedRequest(user.id, ["trust:read"]);
    const res = await getTrust(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailVerified).toBe(true);
    expect(body.twoFactorEnabled).toBe(true);
    expect(body.ageVerified).toBe(true);
  });

  it("computes accountAgeDays off createdAt", async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const user = await createUser({ createdAt: tenDaysAgo });
    const req = await authorizedRequest(user.id, ["trust:read"]);
    const res = await getTrust(req);

    const body = await res.json();
    expect(body.accountAgeDays).toBe(10);
  });

  it("401s once the authorization is revoked", async () => {
    const user = await createUser();
    const app = await createPublicClientApp(user.id);
    const code = await issueAuthorizationCode({
      appId: app.id,
      userId: user.id,
      redirectUri: "https://example.com/callback",
      approvedScopes: ["trust:read"],
      codeChallenge: "verifier123",
      codeChallengeMethod: "plain",
    });
    const result = await exchangeAuthorizationCode({ code, codeVerifier: "verifier123", redirectUri: "https://example.com/callback", appId: app.id });
    if ("error" in result) throw new Error(result.error);

    const authorization = await db.oAuthAuthorization.findUniqueOrThrow({ where: { appId_userId: { appId: app.id, userId: user.id } } });
    const { revokeOAuthAuthorization } = await import("@/lib/oauth");
    await revokeOAuthAuthorization(authorization.id, user.id);

    const req = new Request("https://0dot.in/api/v1/users/me/trust", {
      headers: { Authorization: `Bearer ${result.accessToken}` },
    });
    const res = await getTrust(req);
    expect(res.status).toBe(401);
  });
});
