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
