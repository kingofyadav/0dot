import "server-only";
import { db } from "@/lib/db";
import { cursorWhere, paginate, POST_PAGE_SIZE, type PostCursor } from "@/lib/pagination";

// Plain server-only lib, not a "use server" action file — same reasoning as
// communities.ts/blocks.ts: these queries trust a bare communityId/slug
// with no request-level auth of their own.

const revisionEditorInclude = { username: true, profile: true } as const;

export function getWikiPage(communityId: string, slug: string) {
  return db.wikiPage.findUnique({
    where: { communityId_slug: { communityId, slug } },
    include: { currentRevision: { include: { editor: { include: revisionEditorInclude } } } },
  });
}

export function listWikiPages(communityId: string) {
  return db.wikiPage.findMany({
    where: { communityId },
    orderBy: { title: "asc" },
  });
}

// Cursor-paginated revision history, newest first — reuses pagination.ts's
// generic {createdAt, id} cursor helpers as-is (WikiRevision rows already
// have that shape), same posture as messaging.ts's getMessagesForConversation.
export async function getWikiRevisions(wikiPageId: string, cursor: PostCursor | null) {
  const rows = await db.wikiRevision.findMany({
    where: { wikiPageId, ...cursorWhere(cursor) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: POST_PAGE_SIZE + 1,
    include: { editor: { include: revisionEditorInclude } },
  });
  return paginate(rows);
}

// phase-7 spec §5.1: the profile-owned parallel to getWikiPage/listWikiPages
// above — same table, different owner column. children are included
// (ordered by position) since a documentation page's read view always
// wants its own sub-tree alongside its content (spec §5.2's persistent
// nested TOC), not a second query the caller has to remember to make.
export function getProfileWikiPage(profileId: string, slug: string) {
  return db.wikiPage.findUnique({
    where: { profileId_slug: { profileId, slug } },
    include: {
      currentRevision: { include: { editor: { include: revisionEditorInclude } } },
      children: { orderBy: { position: "asc" } },
      parent: { select: { slug: true, title: true } },
    },
  });
}

// Top-level pages only (parentPageId null) — matches spec §6.3's "chapter
// list renders in position order under whatever parentPageId hierarchy
// exists" framing: a listing surface shows the roots, each page's own view
// shows its children.
export function listProfileWikiPages(profileId: string) {
  return db.wikiPage.findMany({
    where: { profileId, parentPageId: null },
    orderBy: { position: "asc" },
  });
}

export function listAllProfileWikiPages(profileId: string) {
  return db.wikiPage.findMany({
    where: { profileId },
    orderBy: [{ parentPageId: "asc" }, { position: "asc" }],
  });
}

// phase-7 spec §6.1: chapters are WikiPage rows with bookId set and
// kind = "book_chapter" — same shape as the profile-owned functions above,
// scoped to bookId instead of profileId.
export function getBookChapter(bookId: string, slug: string) {
  return db.wikiPage.findUnique({
    where: { bookId_slug: { bookId, slug } },
    include: {
      currentRevision: { include: { editor: { include: revisionEditorInclude } } },
      children: { orderBy: { position: "asc" } },
      parent: { select: { slug: true, title: true } },
    },
  });
}

export function listBookChapters(bookId: string) {
  return db.wikiPage.findMany({
    where: { bookId, parentPageId: null },
    orderBy: { position: "asc" },
  });
}

export function listAllBookChapters(bookId: string) {
  return db.wikiPage.findMany({
    where: { bookId },
    orderBy: [{ parentPageId: "asc" }, { position: "asc" }],
  });
}
