import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getProfileWikiPage } from "@/lib/wiki";
import { renderWikiMarkdown } from "@/lib/wiki-markdown";
import { EngagementSection } from "@/components/EngagementSection";

const KIND_LABEL: Record<string, string> = { wiki: "Wiki page", documentation: "Documentation" };

export default async function ProfileWikiPage({ params }: { params: Promise<{ username: string; slug: string }> }) {
  const { username: rawParam, slug: rawSlug } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username?.user.profile) notFound();

  const page = await getProfileWikiPage(username.user.profile.id, slug);
  if (!page) notFound();

  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === username.user.id;

  // Personal wiki/docs pages have no draft/published status (unlike
  // Article) — visibility is the only gate, same "private is real
  // access control" posture Article's §3.2 introduced.
  if (!isOwner && page.visibility === "private") notFound();

  const [comments, isLiked, likeCount] = await Promise.all([
    db.comment.findMany({
      where: { subjectType: "wiki_page", subjectId: page.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { author: { include: { username: true, profile: true } } },
    }),
    currentUser
      ? db.reaction.findUnique({ where: { subjectType_subjectId_userId: { subjectType: "wiki_page", subjectId: page.id, userId: currentUser.id } } })
      : null,
    db.reaction.count({ where: { subjectType: "wiki_page", subjectId: page.id } }),
  ]);

  return (
    <div className="profileCard">
      <Link href={`/${handle}/wiki`} className="mutedText" style={{ fontSize: "0.85rem" }}>
        ← {username.user.profile.displayName ?? handle}&rsquo;s {KIND_LABEL[page.kind].toLowerCase()}
      </Link>
      {page.parent && (
        <div>
          <Link href={`/${handle}/wiki/${page.parent.slug}`} className="mutedText" style={{ fontSize: "0.85rem" }}>
            ↑ {page.parent.title}
          </Link>
        </div>
      )}

      <h1 style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: "0.6rem" }}>{page.title}</h1>
      <p className="mutedText" style={{ marginTop: "0.2rem", fontSize: "0.85rem" }}>
        {KIND_LABEL[page.kind]}
        {page.visibility === "unlisted" && " · Unlisted"}
        {page.visibility === "private" && " · Private"}
      </p>

      {isOwner && (
        <div style={{ marginTop: "0.5rem" }}>
          <Link href={`/s/${handle}/content/wiki#wiki-${page.id}`} className="button buttonSecondary buttonSmall">
            Edit page
          </Link>
        </div>
      )}

      {page.currentRevision && <div style={{ marginTop: "0.75rem" }}>{renderWikiMarkdown(page.currentRevision.body)}</div>}

      {page.children.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <p className="sectionHeading">Sub-pages</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {page.children
              .filter((child) => isOwner || child.visibility !== "private")
              .map((child) => (
                <Link key={child.id} href={`/${handle}/wiki/${child.slug}`} className="profileLinkItem">
                  {child.title}
                </Link>
              ))}
          </div>
        </div>
      )}

      <EngagementSection
        subjectType="wiki_page"
        subjectId={page.id}
        likeCount={likeCount}
        isLiked={Boolean(isLiked)}
        currentUserId={currentUser?.id ?? null}
        ownerId={username.user.id}
        showCommentForm
        comments={comments.map((c) => ({
          id: c.id,
          body: c.body,
          authorId: c.authorId,
          authorName: c.author.profile?.displayName ?? c.author.username?.handle ?? "Unknown",
        }))}
      />
    </div>
  );
}
