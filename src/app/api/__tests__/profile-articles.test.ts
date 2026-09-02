import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createUser } from "@/test/factories";
import { issueAuthorizationCode, exchangeAuthorizationCode } from "@/lib/oauth";
import { GET as getArticleList } from "@/app/api/v1/profiles/[username]/articles/route";
import { GET as getArticleDetail } from "@/app/api/v1/profiles/[username]/articles/[slug]/route";

async function createPublicClientApp(ownerId: string) {
  return db.developerApp.create({
    data: {
      ownerType: "user",
      ownerUserId: ownerId,
      name: "Article Route Test App",
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

describe("GET /api/v1/profiles/[username]/articles", () => {
  it("lists only published+public articles", async () => {
    const author = await createUser();
    await db.article.create({
      data: { authorId: author.id, slug: "public-one", title: "Public One", status: "published", visibility: "public", publishedAt: new Date() },
    });
    await db.article.create({
      data: { authorId: author.id, slug: "draft-one", title: "Draft One", status: "draft", visibility: "public" },
    });
    await db.article.create({
      data: { authorId: author.id, slug: "private-one", title: "Private One", status: "published", visibility: "private", publishedAt: new Date() },
    });

    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, `https://0dot.in/api/v1/profiles/${author.username!.handle}/articles`);
    const res = await getArticleList(req, { params: Promise.resolve({ username: author.username!.handle }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((a: { slug: string }) => a.slug)).toEqual(["public-one"]);
  });
});

describe("GET /api/v1/profiles/[username]/articles/[slug]", () => {
  it("returns a published public article to any viewer", async () => {
    const author = await createUser();
    await db.article.create({
      data: { authorId: author.id, slug: "readable", title: "Readable", body: "Hello world", status: "published", visibility: "public", publishedAt: new Date() },
    });
    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, `https://0dot.in/api/v1/profiles/${author.username!.handle}/articles/readable`);
    const res = await getArticleDetail(req, { params: Promise.resolve({ username: author.username!.handle, slug: "readable" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Readable");
    expect(body.body).toBe("Hello world");
    expect(body.isOwner).toBe(false);
  });

  it("404s a private article for a non-owner", async () => {
    const author = await createUser();
    await db.article.create({
      data: { authorId: author.id, slug: "secret", title: "Secret", status: "published", visibility: "private", publishedAt: new Date() },
    });
    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, `https://0dot.in/api/v1/profiles/${author.username!.handle}/articles/secret`);
    const res = await getArticleDetail(req, { params: Promise.resolve({ username: author.username!.handle, slug: "secret" }) });
    expect(res.status).toBe(404);
  });

  it("lets the owner read their own private draft", async () => {
    const author = await createUser();
    await db.article.create({
      data: { authorId: author.id, slug: "wip", title: "Work in progress", status: "draft", visibility: "private" },
    });
    const req = await authorizedRequest(author.id, `https://0dot.in/api/v1/profiles/${author.username!.handle}/articles/wip`);
    const res = await getArticleDetail(req, { params: Promise.resolve({ username: author.username!.handle, slug: "wip" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).isOwner).toBe(true);
  });

  it("returns an unlisted-but-published article via direct link even though it's excluded from the list", async () => {
    const author = await createUser();
    await db.article.create({
      data: { authorId: author.id, slug: "unlisted-one", title: "Unlisted", status: "published", visibility: "unlisted", publishedAt: new Date() },
    });
    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, `https://0dot.in/api/v1/profiles/${author.username!.handle}/articles/unlisted-one`);
    const res = await getArticleDetail(req, { params: Promise.resolve({ username: author.username!.handle, slug: "unlisted-one" }) });
    expect(res.status).toBe(200);
  });
});
