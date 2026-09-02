import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createUser } from "@/test/factories";
import { issueAuthorizationCode, exchangeAuthorizationCode } from "@/lib/oauth";
import { GET } from "@/app/api/v1/profiles/[username]/resume/route";

async function createPublicClientApp(ownerId: string) {
  return db.developerApp.create({
    data: {
      ownerType: "user",
      ownerUserId: ownerId,
      name: "Resume Route Test App",
      description: "test",
      clientId: `client_${randomUUID()}`,
      clientSecretHash: "unused",
      isPublicClient: true,
      redirectUrisJson: JSON.stringify(["https://example.com/callback"]),
    },
  });
}

async function authorizedRequest(viewerId: string, url: string) {
  const app = await createPublicClientApp(viewerId);
  const code = await issueAuthorizationCode({
    appId: app.id,
    userId: viewerId,
    redirectUri: "https://example.com/callback",
    approvedScopes: ["profile:read"],
    codeChallenge: "verifier123",
    codeChallengeMethod: "plain",
  });
  const result = await exchangeAuthorizationCode({ code, codeVerifier: "verifier123", redirectUri: "https://example.com/callback", appId: app.id });
  if ("error" in result) throw new Error(result.error);
  return new Request(url, { headers: { Authorization: `Bearer ${result.accessToken}` } });
}

describe("GET /api/v1/profiles/[username]/resume", () => {
  it("returns skills/work/education/featured projects", async () => {
    const owner = await createUser();
    await db.profile.update({
      where: { userId: owner.id },
      data: {
        skills: { create: [{ name: "TypeScript", position: 0 }] },
        workExperiences: { create: [{ title: "Engineer", company: "Acme", position: 0, startDate: new Date("2020-01-01") }] },
        education: { create: [{ institution: "State U", position: 0, startDate: new Date("2016-01-01") }] },
      },
    });
    const project = await db.project.create({
      data: { ownerId: owner.id, slug: `proj-${randomUUID().slice(0, 8)}`, title: "Cool Project", featuredOnResume: true, visibility: "public" },
    });

    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, `https://0dot.in/api/v1/profiles/${owner.username!.handle}/resume`);
    const res = await GET(req, { params: Promise.resolve({ username: owner.username!.handle }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skills).toEqual([expect.objectContaining({ name: "TypeScript" })]);
    expect(body.workExperiences).toEqual([expect.objectContaining({ title: "Engineer", company: "Acme" })]);
    expect(body.education).toEqual([expect.objectContaining({ institution: "State U" })]);
    expect(body.featuredProjects).toEqual([expect.objectContaining({ id: project.id, title: "Cool Project" })]);
  });

  it("404s for an unknown username", async () => {
    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, "https://0dot.in/api/v1/profiles/no-such-user/resume");
    const res = await GET(req, { params: Promise.resolve({ username: "no-such-user" }) });
    expect(res.status).toBe(404);
  });

  it("404s when the viewer has blocked (or is blocked by) the profile owner", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    await db.block.create({ data: { blockerId: viewer.id, blockedId: owner.id } });

    const req = await authorizedRequest(viewer.id, `https://0dot.in/api/v1/profiles/${owner.username!.handle}/resume`);
    const res = await GET(req, { params: Promise.resolve({ username: owner.username!.handle }) });
    expect(res.status).toBe(404);
  });
});
