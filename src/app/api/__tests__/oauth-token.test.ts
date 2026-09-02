import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createUser } from "@/test/factories";
import { issueAuthorizationCode } from "@/lib/oauth";
import { POST } from "@/app/api/oauth/token/route";

function call(fields: Record<string, string>) {
  return POST(
    new Request("https://0dot.in/api/oauth/token", {
      method: "POST",
      body: new URLSearchParams(fields),
    })
  );
}

async function createPublicClientApp(ownerId: string) {
  return db.developerApp.create({
    data: {
      ownerType: "user",
      ownerUserId: ownerId,
      name: "Token Route Test App",
      description: "test",
      clientId: `client_${randomUUID()}`,
      clientSecretHash: "unused",
      isPublicClient: true,
      redirectUrisJson: JSON.stringify(["https://example.com/callback"]),
    },
  });
}

// RFC 6749 §5.2 error shapes, exercised through the real route (not just
// the oauth.ts lib functions — see src/lib/__tests__/oauth-refresh.test.ts
// for those) so a regression in request parsing / client lookup / rate
// -limit wiring is caught here, not just a logic bug in the lib.
describe("POST /api/oauth/token", () => {
  it("rejects an unsupported grant_type", async () => {
    const res = await call({ grant_type: "password", client_id: "whatever" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unsupported_grant_type" });
  });

  it("rejects an unknown client_id", async () => {
    const res = await call({ grant_type: "authorization_code", client_id: "no-such-client", code: "x", code_verifier: "y", redirect_uri: "https://example.com/callback" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_client" });
  });

  it("exchanges a valid authorization code for tokens", async () => {
    const user = await createUser();
    const app = await createPublicClientApp(user.id);
    const code = await issueAuthorizationCode({
      appId: app.id,
      userId: user.id,
      redirectUri: "https://example.com/callback",
      approvedScopes: ["profile:read"],
      codeChallenge: "verifier123",
      codeChallengeMethod: "plain",
    });

    const res = await call({
      grant_type: "authorization_code",
      client_id: app.clientId,
      code,
      code_verifier: "verifier123",
      redirect_uri: "https://example.com/callback",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ token_type: "Bearer", scope: "profile:read" });
    expect(typeof body.access_token).toBe("string");
    expect(typeof body.refresh_token).toBe("string");
  });

  it("rejects a reused authorization code", async () => {
    const user = await createUser();
    const app = await createPublicClientApp(user.id);
    const code = await issueAuthorizationCode({
      appId: app.id,
      userId: user.id,
      redirectUri: "https://example.com/callback",
      approvedScopes: ["profile:read"],
      codeChallenge: "verifier123",
      codeChallengeMethod: "plain",
    });
    const fields = {
      grant_type: "authorization_code",
      client_id: app.clientId,
      code,
      code_verifier: "verifier123",
      redirect_uri: "https://example.com/callback",
    };

    expect((await call(fields)).status).toBe(200);
    const second = await call(fields);
    expect(second.status).toBe(400);
  });
});
