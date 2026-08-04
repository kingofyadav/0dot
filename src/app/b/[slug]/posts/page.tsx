import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBusinessMember } from "@/lib/businesses";
import { getBusinessFeedPosts } from "@/lib/business-feed";
import { getVotedPollOptionIds } from "@/lib/feed-query";
import { parseCursor } from "@/lib/pagination";
import { BusinessPostList } from "./BusinessPostList";

// spec §6: the business post feed tab — everything authored as this
// business (Post.businessAuthorId), browsable in one place. Composing
// still happens from the global /feed "Post as" picker; this route is
// read-only, mirroring how /c/[slug]/page.tsx wires cursor/like/bookmark/
// poll-vote state for its own feed.
export default async function BusinessPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  const { cursor: rawCursor } = await searchParams;

  const business = await db.business.findUnique({ where: { slug } });
  if (!business) notFound();

  const currentUser = await getCurrentUser();
  const membership = currentUser ? await getBusinessMember(business.id, currentUser.id) : null;
  if (business.status === "pending" && !membership) notFound();

  const cursor = parseCursor(rawCursor);
  const { items: posts, nextCursor } = await getBusinessFeedPosts({
    businessId: business.id,
    cursor,
    viewerId: currentUser?.id ?? null,
  });

  const postIds = posts.map((p) => p.id);
  const [likedPostIds, bookmarkedPostIds] = currentUser
    ? await Promise.all([
        db.postLike
          .findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } })
          .then((rows) => new Set(rows.map((r) => r.postId))),
        db.bookmark
          .findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } })
          .then((rows) => new Set(rows.map((r) => r.postId))),
      ])
    : [new Set<string>(), new Set<string>()];
  const votedOptionIds = await getVotedPollOptionIds(currentUser?.id, posts);

  return (
    <>
      <div className="profileCard" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{business.name} — Posts</h1>
          <Link href={`/b/${business.slug}`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            Back to business page
          </Link>
        </div>
      </div>
      <BusinessPostList
        businessSlug={business.slug}
        posts={posts}
        currentUser={currentUser}
        likedPostIds={likedPostIds}
        bookmarkedPostIds={bookmarkedPostIds}
        votedOptionIds={votedOptionIds}
        nextCursor={nextCursor}
      />
    </>
  );
}
