import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getCommunityMember } from "@/lib/communities";
import { getWikiRevisions } from "@/lib/wiki";
import { parseCursor } from "@/lib/pagination";

// spec §10.1: revision history storage is the requirement; a diff view is
// explicitly deferred as polish, not a data-model concern — this lists
// full revision bodies chronologically rather than diffing them.
export default async function WikiPageHistory({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; wikiSlug: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { slug: rawSlug, wikiSlug: rawWikiSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  const wikiSlug = decodeURIComponent(rawWikiSlug).toLowerCase();

  const community = await db.community.findUnique({
    where: { slug },
    select: { id: true, slug: true, visibility: true },
  });
  if (!community) notFound();

  const currentUser = await getCurrentUser();
  const membership = currentUser ? await getCommunityMember(community.id, currentUser.id) : null;
  const isActiveMember = membership?.status === "active" || membership?.status === "muted";
  if (community.visibility === "private" && !isActiveMember) {
    return (
      <div className="profileCard">
        <p className="mutedText">This is a private community. Join to see its wiki.</p>
      </div>
    );
  }

  const page = await db.wikiPage.findUnique({ where: { communityId_slug: { communityId: community.id, slug: wikiSlug } } });
  if (!page) notFound();

  const { cursor: rawCursor } = await searchParams;
  const cursor = parseCursor(rawCursor);
  const { items: revisions, nextCursor } = await getWikiRevisions(page.id, cursor);

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{page.title} — history</h1>
        <Link href={`/c/${community.slug}/wiki/${page.slug}`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to page
        </Link>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {revisions.map((revision) => {
          const editorName = revision.editor.profile?.displayName ?? revision.editor.username?.handle ?? "Unknown";
          const isCurrent = revision.id === page.currentRevisionId;
          return (
            <div key={revision.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}>
              <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                {editorName} · {revision.createdAt.toLocaleString()}
                {isCurrent && " · current"}
              </span>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{revision.body}</p>
            </div>
          );
        })}
      </div>

      {nextCursor && (
        <Link
          href={`/c/${community.slug}/wiki/${page.slug}/history?cursor=${encodeURIComponent(nextCursor)}`}
          className="button buttonSecondary loadMoreLink"
        >
          Load more
        </Link>
      )}
    </div>
  );
}
