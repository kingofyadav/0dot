import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createUser } from "@/test/factories";
import { issueAuthorizationCode, exchangeAuthorizationCode } from "@/lib/oauth";
import { GET as getLivestream } from "@/app/api/v1/live/[livestreamId]/route";
import { POST as postToken } from "@/app/api/v1/live/[livestreamId]/token/route";

async function createPublicClientApp(ownerId: string) {
  return db.developerApp.create({
    data: {
      ownerType: "user",
      ownerUserId: ownerId,
      name: "Live Route Test App",
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
  return (url: string, init?: RequestInit) =>
    new Request(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${result.accessToken}` } });
}

async function createLivestream(overrides: Partial<{ status: string; requiredTierId: string | null; creatorId: string }> = {}) {
  const creator = overrides.creatorId ? { id: overrides.creatorId } : await createUser();
  return db.livestream.create({
    data: {
      creatorId: creator.id,
      title: "Test stream",
      status: overrides.status ?? "live",
      requiredTierId: overrides.requiredTierId ?? null,
      ingestKey: `livestream_${randomUUID()}`,
      playbackUrl: `livestream_${randomUUID()}`,
    },
  });
}

describe("GET /api/v1/live/[livestreamId]", () => {
  it("returns hasAccess: true for an ungated livestream", async () => {
    const viewer = await createUser();
    const livestream = await createLivestream();
    const req = await authorizedRequest(viewer.id, ["livestreams:read"]);

    const res = await getLivestream(req(`https://0dot.in/api/v1/live/${livestream.id}`), {
      params: Promise.resolve({ livestreamId: livestream.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasAccess).toBe(true);
    expect(body).not.toHaveProperty("ingestKey");
  });

  it("returns hasAccess: false for a gated livestream the viewer hasn't subscribed to", async () => {
    const creator = await createUser();
    const tier = await db.membershipTier.create({
      data: { creatorId: creator.id, name: "Gold", level: 1, price: 5, billingInterval: "monthly" },
    });
    const viewer = await createUser();
    const livestream = await createLivestream({ creatorId: creator.id, requiredTierId: tier.id });
    const req = await authorizedRequest(viewer.id, ["livestreams:read"]);

    const res = await getLivestream(req(`https://0dot.in/api/v1/live/${livestream.id}`), {
      params: Promise.resolve({ livestreamId: livestream.id }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).hasAccess).toBe(false);
  });

  it("404s for an unknown livestream", async () => {
    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, ["livestreams:read"]);
    const res = await getLivestream(req("https://0dot.in/api/v1/live/no-such-id"), {
      params: Promise.resolve({ livestreamId: "no-such-id" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/live/[livestreamId]/token", () => {
  it("rejects a livestream that isn't live", async () => {
    const viewer = await createUser();
    const livestream = await createLivestream({ status: "scheduled" });
    const req = await authorizedRequest(viewer.id, ["livestreams:read"]);

    const res = await postToken(req(`https://0dot.in/api/v1/live/${livestream.id}/token`, { method: "POST" }), {
      params: Promise.resolve({ livestreamId: livestream.id }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a viewer without access to a gated live livestream", async () => {
    const creator = await createUser();
    const tier = await db.membershipTier.create({
      data: { creatorId: creator.id, name: "Gold", level: 1, price: 5, billingInterval: "monthly" },
    });
    const viewer = await createUser();
    const livestream = await createLivestream({ creatorId: creator.id, requiredTierId: tier.id, status: "live" });
    const req = await authorizedRequest(viewer.id, ["livestreams:read"]);

    const res = await postToken(req(`https://0dot.in/api/v1/live/${livestream.id}/token`, { method: "POST" }), {
      params: Promise.resolve({ livestreamId: livestream.id }),
    });
    expect(res.status).toBe(403);
  });

  it("reaches the token-minting call for a live, accessible livestream (503 without LiveKit configured in tests)", async () => {
    const viewer = await createUser();
    const livestream = await createLivestream({ status: "live" });
    const req = await authorizedRequest(viewer.id, ["livestreams:read"]);

    const res = await postToken(req(`https://0dot.in/api/v1/live/${livestream.id}/token`, { method: "POST" }), {
      params: Promise.resolve({ livestreamId: livestream.id }),
    });
    // vitest.config.ts blanks LIVEKIT_URL/API_KEY/API_SECRET, so
    // createLiveKitToken always returns null here — this confirms the
    // route reaches and correctly handles that "not configured" case
    // rather than asserting on a real JWT this test env can't produce.
    expect(res.status).toBe(503);
  });
});
