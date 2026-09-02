import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createUser } from "@/test/factories";
import { issueAuthorizationCode, exchangeAuthorizationCode } from "@/lib/oauth";
import { GET as getWikiList } from "@/app/api/v1/profiles/[username]/wiki/route";
import { GET as getWikiDetail } from "@/app/api/v1/profiles/[username]/wiki/[slug]/route";

async function createPublicClientApp(ownerId: string) {
  return db.developerApp.create({
    data: {
      ownerType: "user",
      ownerUserId: ownerId,
      name: "Wiki Route Test App",
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

async function createWikiPage(profileId: string, overrides: Partial<{ slug: string; title: string; visibility: string; body: string }> = {}) {
  const page = await db.wikiPage.create({
    data: {
      profileId,
      slug: overrides.slug ?? `page-${randomUUID().slice(0, 8)}`,
      title: overrides.title ?? "A page",
      kind: "wiki",
      visibility: overrides.visibility ?? "public",
      position: 0,
    },
  });
  const revision = await db.wikiRevision.create({
    data: {
      wikiPageId: page.id,
      editedBy: (await db.profile.findUniqueOrThrow({ where: { id: profileId } })).userId,
      body: overrides.body ?? "Hello **wiki**.",
    },
  });
  await db.wikiPage.update({ where: { id: page.id }, data: { currentRevisionId: revision.id } });
  return page;
}

describe("GET /api/v1/profiles/[username]/wiki", () => {
  it("lists only public top-level pages", async () => {
    const author = await createUser();
    await createWikiPage(author.profile!.id, { slug: "pub", visibility: "public" });
    await createWikiPage(author.profile!.id, { slug: "priv", visibility: "private" });

    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, `https://0dot.in/api/v1/profiles/${author.username!.handle}/wiki`);
    const res = await getWikiList(req, { params: Promise.resolve({ username: author.username!.handle }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((p: { slug: string }) => p.slug)).toEqual(["pub"]);
  });
});

describe("GET /api/v1/profiles/[username]/wiki/[slug]", () => {
  it("returns a public page's current revision body", async () => {
    const author = await createUser();
    await createWikiPage(author.profile!.id, { slug: "readable", body: "Hello **wiki**." });

    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, `https://0dot.in/api/v1/profiles/${author.username!.handle}/wiki/readable`);
    const res = await getWikiDetail(req, { params: Promise.resolve({ username: author.username!.handle, slug: "readable" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.body).toBe("Hello **wiki**.");
    expect(body.isOwner).toBe(false);
  });

  it("404s a private page for a non-owner", async () => {
    const author = await createUser();
    await createWikiPage(author.profile!.id, { slug: "secret", visibility: "private" });

    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, `https://0dot.in/api/v1/profiles/${author.username!.handle}/wiki/secret`);
    const res = await getWikiDetail(req, { params: Promise.resolve({ username: author.username!.handle, slug: "secret" }) });
    expect(res.status).toBe(404);
  });

  it("lets the owner read their own private page", async () => {
    const author = await createUser();
    await createWikiPage(author.profile!.id, { slug: "mine", visibility: "private" });

    const req = await authorizedRequest(author.id, `https://0dot.in/api/v1/profiles/${author.username!.handle}/wiki/mine`);
    const res = await getWikiDetail(req, { params: Promise.resolve({ username: author.username!.handle, slug: "mine" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).isOwner).toBe(true);
  });
});
