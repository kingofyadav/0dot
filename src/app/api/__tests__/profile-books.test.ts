import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createUser } from "@/test/factories";
import { issueAuthorizationCode, exchangeAuthorizationCode } from "@/lib/oauth";
import { GET as getBookList } from "@/app/api/v1/profiles/[username]/books/route";
import { GET as getBookDetail } from "@/app/api/v1/profiles/[username]/books/[slug]/route";
import { GET as getChapterDetail } from "@/app/api/v1/profiles/[username]/books/[slug]/[chapterSlug]/route";

async function createPublicClientApp(ownerId: string) {
  return db.developerApp.create({
    data: {
      ownerType: "user",
      ownerUserId: ownerId,
      name: "Book Route Test App",
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

describe("book viewing routes", () => {
  it("lists only published+public books", async () => {
    const author = await createUser();
    await db.book.create({ data: { profileId: author.profile!.id, slug: "book-one", title: "Book One", status: "published", visibility: "public" } });
    await db.book.create({ data: { profileId: author.profile!.id, slug: "book-draft", title: "Draft Book", status: "draft", visibility: "public" } });

    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, `https://0dot.in/api/v1/profiles/${author.username!.handle}/books`);
    const res = await getBookList(req, { params: Promise.resolve({ username: author.username!.handle }) });
    expect(res.status).toBe(200);
    expect((await res.json()).items.map((b: { slug: string }) => b.slug)).toEqual(["book-one"]);
  });

  it("returns a book's detail with its public chapter list", async () => {
    const author = await createUser();
    const book = await db.book.create({
      data: { profileId: author.profile!.id, slug: "readable-book", title: "Readable Book", status: "published", visibility: "public" },
    });
    await db.wikiPage.create({
      data: { bookId: book.id, slug: "ch1", title: "Chapter 1", kind: "book_chapter", visibility: "public", position: 0 },
    });
    await db.wikiPage.create({
      data: { bookId: book.id, slug: "ch2-secret", title: "Secret Chapter", kind: "book_chapter", visibility: "private", position: 1 },
    });

    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, `https://0dot.in/api/v1/profiles/${author.username!.handle}/books/readable-book`);
    const res = await getBookDetail(req, { params: Promise.resolve({ username: author.username!.handle, slug: "readable-book" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chapters.map((c: { slug: string }) => c.slug)).toEqual(["ch1"]);
  });

  it("returns a public chapter's body", async () => {
    const author = await createUser();
    const book = await db.book.create({
      data: { profileId: author.profile!.id, slug: "book-x", title: "Book X", status: "published", visibility: "public" },
    });
    const chapter = await db.wikiPage.create({
      data: { bookId: book.id, slug: "intro", title: "Intro", kind: "book_chapter", visibility: "public", position: 0 },
    });
    const revision = await db.wikiRevision.create({ data: { wikiPageId: chapter.id, editedBy: author.id, body: "Chapter body." } });
    await db.wikiPage.update({ where: { id: chapter.id }, data: { currentRevisionId: revision.id } });

    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, `https://0dot.in/api/v1/profiles/${author.username!.handle}/books/book-x/intro`);
    const res = await getChapterDetail(req, { params: Promise.resolve({ username: author.username!.handle, slug: "book-x", chapterSlug: "intro" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).body).toBe("Chapter body.");
  });

  it("404s a private chapter for a non-owner", async () => {
    const author = await createUser();
    const book = await db.book.create({
      data: { profileId: author.profile!.id, slug: "book-y", title: "Book Y", status: "published", visibility: "public" },
    });
    await db.wikiPage.create({
      data: { bookId: book.id, slug: "hidden", title: "Hidden", kind: "book_chapter", visibility: "private", position: 0 },
    });

    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, `https://0dot.in/api/v1/profiles/${author.username!.handle}/books/book-y/hidden`);
    const res = await getChapterDetail(req, { params: Promise.resolve({ username: author.username!.handle, slug: "book-y", chapterSlug: "hidden" }) });
    expect(res.status).toBe(404);
  });
});
