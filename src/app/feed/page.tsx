import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseCursor } from "@/lib/pagination";
import { getFeedPosts, getVotedPollOptionIds } from "@/lib/feed-query";
import { getPostableBusinesses } from "@/lib/businesses";
import { getMyPayoutAccount } from "@/lib/payments";
import { FeedList } from "./FeedList";

const PAYOUT_STATUS_LABEL: Record<string, string> = {
  onboarding: "Onboarding",
  active: "Active",
  restricted: "Restricted",
};

// Home: posts from accounts the viewer follows, plus their own posts —
// resolves phase-1's open question (§5.4/§7.5) now that Follow exists.
// Strictly personalized — a logged-out visitor has no follow graph, so
// there's nothing meaningful to show them here; they're sent to /explore
// (the global chronological feed) instead of seeing a faked-up fallback.
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/explore");

  const { cursor: rawCursor } = await searchParams;
  const cursor = parseCursor(rawCursor);

  const followedIds = await db.follow.findMany({
    where: { followerId: currentUser.id },
    select: { followeeId: true },
  });
  const authorFilter = {
    authorId: { in: [currentUser.id, ...followedIds.map((f) => f.followeeId)] },
  };

  const { items: posts, nextCursor } = await getFeedPosts({ authorFilter, cursor, viewerId: currentUser.id });

  const postIds = posts.map((p) => p.id);
  const [likedPostIds, bookmarkedPostIds] = await Promise.all([
    db.postLike
      .findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } })
      .then((rows) => new Set(rows.map((r) => r.postId))),
    db.bookmark
      .findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } })
      .then((rows) => new Set(rows.map((r) => r.postId))),
  ]);

  const votedOptionIds = await getVotedPollOptionIds(currentUser.id, posts);
  const postableBusinesses = await getPostableBusinesses(currentUser.id);
  const ownTiers = await db.membershipTier.findMany({
    where: { creatorId: currentUser.id, status: "active" },
    select: { id: true, name: true },
    orderBy: { level: "asc" },
  });

  // phase-5: quick entry points into the creator's own monetization tools,
  // deep-linking to the matching #section on the settings page (§3-§11)
  // rather than duplicating any of that UI here. Skipped entirely for a
  // viewer with no claimed username — same gate ComposeBox already applies,
  // since none of this is reachable without a profile anyway.
  const handle = currentUser.username?.handle;
  const creatorStudio = handle
    ? await (async () => {
        const [payoutAccount, tierCount, productCount, courseCount, hasPodcast, newsletterSubscriberCount, programCount, livestreamCount] =
          await Promise.all([
            getMyPayoutAccount(currentUser.id),
            db.membershipTier.count({ where: { creatorId: currentUser.id } }),
            db.digitalProduct.count({ where: { creatorId: currentUser.id } }),
            db.course.count({ where: { creatorId: currentUser.id } }),
            db.podcast.count({ where: { creatorId: currentUser.id } }).then((n) => n > 0),
            db.newsletterSubscription.count({ where: { creatorId: currentUser.id, unsubscribedAt: null } }),
            db.affiliateProgram.count({ where: { creatorId: currentUser.id } }),
            db.livestream.count({ where: { creatorId: currentUser.id } }),
          ]);
        return { payoutAccount, tierCount, productCount, courseCount, hasPodcast, newsletterSubscriberCount, programCount, livestreamCount };
      })()
    : null;

  return (
    <>
      <FeedList
        posts={posts}
        currentUser={currentUser}
        likedPostIds={likedPostIds}
        bookmarkedPostIds={bookmarkedPostIds}
        votedOptionIds={votedOptionIds}
        nextCursor={nextCursor}
        basePath="/feed"
        postableBusinesses={postableBusinesses}
        ownTiers={ownTiers}
      />
      {handle && creatorStudio && (
        <details className="profileEditToggle" style={{ marginTop: "1.5rem" }}>
          <summary className="sectionHeading" style={{ display: "inline-block" }}>
            Creator studio
          </summary>
          <div className="profileCard" style={{ marginTop: "0.75rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <Link href={`/s/${handle}#monetization`} className="button buttonSecondary buttonSmall">
                Payouts: {creatorStudio.payoutAccount ? PAYOUT_STATUS_LABEL[creatorStudio.payoutAccount.status] ?? creatorStudio.payoutAccount.status : "Not set up"}
              </Link>
              <Link href={`/s/${handle}#memberships`} className="button buttonSecondary buttonSmall">
                Memberships ({creatorStudio.tierCount})
              </Link>
              <Link href={`/s/${handle}#digital-products`} className="button buttonSecondary buttonSmall">
                Digital products ({creatorStudio.productCount})
              </Link>
              <Link href={`/s/${handle}#courses`} className="button buttonSecondary buttonSmall">
                Courses ({creatorStudio.courseCount})
              </Link>
              <Link href={`/s/${handle}#podcasts`} className="button buttonSecondary buttonSmall">
                {creatorStudio.hasPodcast ? "Podcast" : "Start a podcast"}
              </Link>
              <Link href={`/s/${handle}#newsletter`} className="button buttonSecondary buttonSmall">
                Newsletter ({creatorStudio.newsletterSubscriberCount})
              </Link>
              <Link href={`/s/${handle}#affiliate-programs`} className="button buttonSecondary buttonSmall">
                Affiliate ({creatorStudio.programCount})
              </Link>
              <Link href={`/s/${handle}#livestreams`} className="button buttonSecondary buttonSmall">
                Livestreams ({creatorStudio.livestreamCount})
              </Link>
            </div>
          </div>
        </details>
      )}
    </>
  );
}
