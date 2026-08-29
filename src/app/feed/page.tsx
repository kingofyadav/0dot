import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseCursor } from "@/lib/pagination";
import { getFeedPosts, getVotedPollOptionIds } from "@/lib/feed-query";
import { getFolloweeIds } from "@/lib/follow-graph";
import { getPostableBusinesses } from "@/lib/businesses";
import { getMyPayoutAccount } from "@/lib/payments";
import { DismissibleNotice } from "@/components/DismissibleNotice";
import { FeedList } from "./FeedList";

export const metadata: Metadata = { title: "Feed" };

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
  searchParams: Promise<{ cursor?: string; link?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/explore");

  const { cursor: rawCursor, link } = await searchParams;
  const cursor = parseCursor(rawCursor);

  const followedIds = await getFolloweeIds(currentUser.id);
  const authorFilter = {
    authorId: { in: [currentUser.id, ...followedIds] },
  };

  const { items: posts, nextCursor } = await getFeedPosts({ authorFilter, cursor, viewerId: currentUser.id });

  // These five queries are all independent of each other (posts is already
  // resolved above) — one batch instead of two halves the round trips this
  // stage pays, each one a network hop to the libsql backend.
  const postIds = posts.map((p) => p.id);
  const [likedPostIds, bookmarkedPostIds, votedOptionIds, postableBusinesses, ownTiers] = await Promise.all([
    db.postLike
      .findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } })
      .then((rows) => new Set(rows.map((r) => r.postId))),
    db.bookmark
      .findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } })
      .then((rows) => new Set(rows.map((r) => r.postId))),
    getVotedPollOptionIds(currentUser.id, posts),
    getPostableBusinesses(currentUser.id),
    db.membershipTier.findMany({
      where: { creatorId: currentUser.id, status: "active" },
      select: { id: true, name: true },
      orderBy: { level: "asc" },
    }),
  ]);

  const handle = currentUser.username?.handle;

  return (
    <>
      {link === "unavailable" && <DismissibleNotice message="That link isn't available." />}
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
      {/* Deep-links into the settings page's monetization sections — eight
          more count/lookup queries that aren't needed to render the feed
          itself, so they're deferred behind Suspense rather than adding to
          this page's TTFB. */}
      {handle && (
        <Suspense fallback={null}>
          <CreatorStudio userId={currentUser.id} handle={handle} />
        </Suspense>
      )}
    </>
  );
}

// phase-5: quick entry points into the creator's own monetization tools,
// deep-linking to the matching #section on the settings page (§3-§11)
// rather than duplicating any of that UI here. Only rendered for a viewer
// with a claimed username — same gate ComposeBox already applies, since
// none of this is reachable without a profile anyway.
async function CreatorStudio({ userId, handle }: { userId: string; handle: string }) {
  const [payoutAccount, tierCount, productCount, courseCount, hasPodcast, newsletterSubscriberCount, programCount, livestreamCount] =
    await Promise.all([
      getMyPayoutAccount(userId),
      db.membershipTier.count({ where: { creatorId: userId } }),
      db.digitalProduct.count({ where: { creatorId: userId } }),
      db.course.count({ where: { creatorId: userId } }),
      db.podcast.count({ where: { creatorId: userId } }).then((n) => n > 0),
      db.newsletterSubscription.count({ where: { creatorId: userId, unsubscribedAt: null } }),
      db.affiliateProgram.count({ where: { creatorId: userId } }),
      db.livestream.count({ where: { creatorId: userId } }),
    ]);

  return (
    <details className="profileEditToggle" style={{ marginTop: "1.5rem" }}>
      <summary className="sectionHeading" style={{ display: "inline-block" }}>
        Creator studio
      </summary>
      <div className="profileCard" style={{ marginTop: "0.75rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <Link href={`/s/${handle}#monetization`} className="button buttonSecondary buttonSmall">
            Payouts: {payoutAccount ? PAYOUT_STATUS_LABEL[payoutAccount.status] ?? payoutAccount.status : "Not set up"}
          </Link>
          <Link href={`/s/${handle}#memberships`} className="button buttonSecondary buttonSmall">
            Memberships ({tierCount})
          </Link>
          <Link href={`/s/${handle}#digital-products`} className="button buttonSecondary buttonSmall">
            Digital products ({productCount})
          </Link>
          <Link href={`/s/${handle}#courses`} className="button buttonSecondary buttonSmall">
            Courses ({courseCount})
          </Link>
          <Link href={`/s/${handle}#podcasts`} className="button buttonSecondary buttonSmall">
            {hasPodcast ? "Podcast" : "Start a podcast"}
          </Link>
          <Link href={`/s/${handle}#newsletter`} className="button buttonSecondary buttonSmall">
            Newsletter ({newsletterSubscriberCount})
          </Link>
          <Link href={`/s/${handle}#affiliate-programs`} className="button buttonSecondary buttonSmall">
            Affiliate ({programCount})
          </Link>
          <Link href={`/s/${handle}#livestreams`} className="button buttonSecondary buttonSmall">
            Livestreams ({livestreamCount})
          </Link>
        </div>
      </div>
    </details>
  );
}
