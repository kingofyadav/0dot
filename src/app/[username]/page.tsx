import { Fragment, Suspense } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Check, Sparkle, Link2 as LinkIcon, Newspaper } from "lucide-react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { followUser, unfollowUser } from "@/app/actions/follow";
import { blockUser, unblockUser } from "@/app/actions/block";
import { ReportButton } from "@/components/ReportButton";
import { isBlocked } from "@/lib/blocks";
import { getThemePreset, getSocialPlatformLabel, type SocialPlatform } from "@/lib/theme-presets";
import { isProfilePremium } from "@/lib/platform-billing";
import { getWalletBalance } from "@/lib/wallet/ledger";
import { getPrimaryLiveDomain } from "@/lib/custom-domains";
import { getFeedPosts, getVotedPollOptionIds } from "@/lib/feed-query";
import { parseCursor } from "@/lib/pagination";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { ScrollToHashPost } from "@/components/ScrollToHashPost";
import { SocialIcon } from "@/components/SocialIcon";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { PostCard } from "@/components/PostCard";
import { TipForm } from "@/components/TipForm";
import { SubscribeForm } from "@/components/SubscribeForm";
import { DigitalProductCard } from "@/components/DigitalProductCard";
import { PodcastEpisodesList } from "@/components/PodcastEpisodesList";
import { NewsletterSubscribeForm } from "@/components/NewsletterSubscribeForm";
import { BecomeAffiliateForm } from "@/components/BecomeAffiliateForm";
import { endorseSkill } from "@/app/actions/skills";
import { parsePortfolioLayout } from "@/lib/portfolio-layout";

// Fallback cover photo for any profile that hasn't set its own (replaces
// the plain gradient .profileCoverPlaceholder). Served from /public/defaults,
// not /uploads — the /uploads/[...path] route 307-redirects everything to
// Vercel Blob storage, and this asset was never actually written there, so
// it 404'd ("Blob not found") for every new signup.
//
// Theme-aware, the same way the logo is (Logo.tsx / .themeLogo* in
// globals.css): both variants render, CSS shows the one matching the active
// prefers-color-scheme / data-theme. Unlike the logo's deliberately-reversed
// pairing, the cover uses the natural one — the dark cover in dark mode.
const DEFAULT_COVER_LIGHT = "/defaults/profile-cover-light.jpg";
const DEFAULT_COVER_DARK = "/defaults/profile-cover-dark.jpg";

// Single source of truth for both the query itself and (via ReturnType
// below) the types every section of this page needs — including the two
// components streamed in under <Suspense> further down. Every db round
// trip on this route is a network call (see src/lib/db.ts's libsql
// adapter), so the goal throughout this file is: one blocking query to get
// a paintable shell on screen fast, everything else batched into as few
// parallel Promise.all groups as their real data dependencies allow, and
// anything not needed for first paint deferred behind Suspense so it
// streams in after the shell rather than delaying TTFB.
function fetchUsernameRecord(handle: string) {
  return db.username.findUnique({
    where: { handle },
    include: {
      user: {
        include: {
          profile: {
            include: {
              links: { orderBy: { position: "asc" } },
              socialLinks: { orderBy: { position: "asc" } },
              skills: { orderBy: { position: "asc" } },
            },
          },
        },
      },
    },
  });
}

type UsernameRecord = NonNullable<Awaited<ReturnType<typeof fetchUsernameRecord>>>;
type ProfileRecord = NonNullable<UsernameRecord["user"]["profile"]>;
type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

// Small display-only lookup: turns a program's offeringType/offeringId
// pointer into a human label for BecomeAffiliateForm — the same
// polymorphic-pointer-needs-a-resolver shape src/app/aff/[code]/route.ts's
// resolveOfferingUrl already has for redirect targets, applied here for
// display text instead of a URL.
async function resolveAffiliateOfferingLabels(
  programs: { id: string; offeringType: string; offeringId: string }[]
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  await Promise.all(
    programs.map(async (program) => {
      if (program.offeringType === "membership_tier") {
        const tier = await db.membershipTier.findUnique({ where: { id: program.offeringId }, select: { name: true } });
        if (tier) labels.set(program.id, tier.name);
      } else if (program.offeringType === "digital_product") {
        const product = await db.digitalProduct.findUnique({ where: { id: program.offeringId }, select: { title: true } });
        if (product) labels.set(program.id, product.title);
      } else if (program.offeringType === "course") {
        const course = await db.course.findUnique({ where: { id: program.offeringId }, select: { title: true } });
        if (course) labels.set(program.id, course.title);
      }
    })
  );
  return labels;
}

// custom-domains addendum §6.3: the canonical URL is always the owner's
// preference (their live primary custom domain, if any), never a hard
// redirect — 0dot.in/{handle} stays independently resolvable and is the
// fallback default whenever no custom domain is live.
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username: rawParam } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, select: { user: { select: { profile: { select: { id: true } } } } } });
  if (!username?.user.profile) return {};

  const primaryDomain = await getPrimaryLiveDomain("profile", username.user.profile.id);
  return primaryDomain ? { alternates: { canonical: `https://${primaryDomain}` } } : {};
}

// Public, read-only profile — identity, links, follow counts, and (spec
// §3.4) the user's own post list. No editing UI here: that's what
// /s/[username] (owner-only settings) is for.
export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { username: rawParam } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();

  // The two calls below don't depend on each other — running them together
  // instead of one after another halves this stage's round trips.
  const [username, currentUser] = await Promise.all([fetchUsernameRecord(handle), getCurrentUser()]);

  if (!username || !username.user.profile) {
    notFound();
  }

  const profile = username.user.profile;
  const isOwner = currentUser?.id === username.userId;

  // Everything in this batch only depends on username/currentUser/isOwner
  // (already resolved above), not on each other — previously these ran as
  // five-plus sequential awaits, each paying its own round trip.
  const [followRow, blockedByViewer, viewerBlockedByOwner, payoutAccount, recentTips, isPremium, viewerWallet] = await Promise.all([
    currentUser && !isOwner
      ? db.follow.findUnique({
          where: { followerId_followeeId: { followerId: currentUser.id, followeeId: username.userId } },
          select: { status: true },
        })
      : Promise.resolve(null),
    currentUser && !isOwner ? isBlocked(currentUser.id, username.userId) : Promise.resolve(false),
    currentUser && !isOwner ? isBlocked(username.userId, currentUser.id) : Promise.resolve(false),
    // spec §6: tipping gated on the profile owner having an active payout
    // account (spec §3.5's literal criterion, re-checked here rather than
    // trusted from any client state).
    db.creatorPayoutAccount.findUnique({ where: { userId: username.userId }, select: { status: true } }),
    // spec §13.2's one deliberate "financial data is public by default"
    // exception — recent public tip messages, shown under the identity
    // header regardless of who's viewing.
    db.tip.findMany({
      where: { toCreatorId: username.userId, message: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { fromUser: { include: { username: true, profile: true } } },
    }),
    isProfilePremium(profile.id),
    // Viewer's coin balance — the coin rail works even when the creator has
    // no Stripe payout account (addendum-coin-wallet-v2.md §6.4), so the
    // payment forms render regardless and disable/hint on an empty wallet.
    currentUser && !isOwner ? getWalletBalance(currentUser.id) : Promise.resolve(null),
  ]);

  // Only an "accepted" row counts as isFollowing (see followUser/
  // acceptFollowRequest, src/app/actions/follow.ts) — a "pending" row (a
  // request against a private account awaiting approval) must never itself
  // grant follower-only access, or a private account's whole approval gate
  // would be moot: anyone could unlock it just by clicking Follow once.
  const isFollowing = followRow?.status === "accepted";
  const isFollowRequestPending = followRow?.status === "pending";
  // If the owner has blocked the viewer, no Follow/Block controls render at
  // all — quietly, matching how most platforms don't advertise block state.
  const showViewerControls = !!currentUser && !isOwner && !viewerBlockedByOwner;

  // Settings-page "Private profile" toggle (§ EditProfileForm): a visitor
  // who is neither the owner nor an accepted follower only ever sees
  // identity (avatar/name/bio) plus the Follow control — every content
  // surface below (posts, links, portfolio, monetization) stays gated
  // behind this, same posture as Instagram/Twitter private accounts.
  const canViewFullProfile = isOwner || !profile.isPrivate || isFollowing;
  // The payment forms render whenever a signed-in non-owner can see the
  // profile — the coin rail needs no payout account. `cardAvailable` just
  // controls whether the card button also shows.
  const cardAvailable = payoutAccount?.status === "active";
  const canTip = showViewerControls && canViewFullProfile;
  const canSubscribe = showViewerControls && canViewFullProfile;
  const canBuy = showViewerControls && canViewFullProfile;
  const viewerCoins = viewerWallet?.total ?? 0;

  // spec §8.1: a section toggled hidden doesn't render even if the
  // underlying rows still exist — purely derived from data already fetched
  // above (profile.portfolioLayoutJson), no extra query needed to decide
  // whether the Resume link shows in the header.
  const showResumeLink = parsePortfolioLayout(profile.portfolioLayoutJson).some((e) => e.key === "resume" && e.visible) && canViewFullProfile;

  const now = new Date();
  const visibleLinks = !canViewFullProfile
    ? []
    : profile.links
        .filter((link) => {
          if (isOwner) return true; // owners see scheduled and downgrade-hidden links too, managed at /s/{handle}
          // premium-profiles addendum §5: a downgrade-hidden link (over the
          // free cap) is never deleted, just hidden from non-owner visitors —
          // same "hidden from the public, visible to the owner" treatment as
          // the scheduled-link check below.
          if (!link.isActive) return false;
          if (link.startsAt && link.startsAt > now) return false;
          if (link.endsAt && link.endsAt < now) return false;
          return true;
        })
        // Featured links render first, larger — ties within each group keep
        // their existing position order (phase-1 spec §4.2). Array.prototype
        // .sort() is stable per the ECMAScript spec, so a same-featured-state
        // comparison of 0 preserves the incoming position-ascending order.
        .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));

  const theme = getThemePreset(profile.themePreset);

  // Same dynamic-origin reasoning as src/app/qr/[handle]/route.ts — correct
  // in local dev and any deployment without a hardcoded domain.
  const headersList = await headers();
  const host = headersList.get("host") ?? "0dot.in";
  const proto = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const profileUrl = `${proto}://${host}/${username.handle}`;

  const { cursor: rawCursor } = await searchParams;
  const cursor = parseCursor(rawCursor);

  return (
    <div
      className="profileCard"
      style={
        {
          "--accent": theme.accent,
          "--accent-strong": theme.accentStrong,
          "--accent-soft": theme.accentSoft,
        } as CSSProperties
      }
    >
      <div className="profileCover">
        {profile.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
          <img src={profile.coverUrl} alt="" className="profileCoverImg" />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped local asset, sized by CSS */}
            <img src={DEFAULT_COVER_LIGHT} alt="" className="profileCoverImg themeCoverLight" />
            {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped local asset, sized by CSS */}
            <img src={DEFAULT_COVER_DARK} alt="" className="profileCoverImg themeCoverDark" />
          </>
        )}
      </div>
      <div className="profileHeaderRow">
        <Avatar src={profile.avatarUrl} alt={profile.displayName} size={96} className="profileAvatar" />
        <div className="profileHeaderInfo">
          {/* Name, primary actions (Follow/Message for a visitor, Edit
              profile for the owner), and the link/follower/following stats
              are three flex items sharing one wrapping row (.profileIdentityStack,
              globals.css) rather than two stacked rows — on desktop there's
              room for name+actions to sit side by side with stats below
              (.profileMeta's flex-basis:100% forces that line break
              regardless of remaining space); on mobile (see that class's
              max-width:639px override) the CSS `order` swaps stats ahead of
              actions, so the sequence reads name -> stats -> actions instead
              of name -> actions -> stats once actions no longer fit next to
              the name and drops to its own line anyway. */}
          <div className="profileIdentityStack">
            <h1 className="profileName">
              {profile.displayName}
              {profile.isVerified && (
                <span className="verifiedBadge" title="Verified" aria-label="Verified">
                  <BadgeCheck size={14} aria-hidden="true" />
                </span>
              )}
              {isPremium && (
                <span className="premiumBadge" title="Premium" aria-label="Premium">
                  <Sparkle size={12} aria-hidden="true" />
                </span>
              )}
            </h1>
            <div className="profileMeta">
              <span className="profileMetaItem">
                <strong>{visibleLinks.length}</strong> link{visibleLinks.length === 1 ? "" : "s"}
              </span>
              <Link href={`/${username.handle}/followers`} className="profileMetaItem">
                <strong>{profile.followerCount}</strong> follower{profile.followerCount === 1 ? "" : "s"}
              </Link>
              <Link href={`/${username.handle}/following`} className="profileMetaItem">
                <strong>{profile.followingCount}</strong> following
              </Link>
            </div>
            {(isOwner || showViewerControls) && (
              <div className="profileActions">
                {showResumeLink && (
                  <Link href={`/${username.handle}/resume`} className="button buttonSecondary">
                    Resume
                  </Link>
                )}
                {isOwner && (
                  <Link href={`/s/${username.handle}`} className="button buttonSecondary">
                    Edit profile
                  </Link>
                )}
                {showViewerControls && (
                  <>
                    <form action={isFollowing || isFollowRequestPending ? unfollowUser : followUser}>
                      <input type="hidden" name="followeeId" value={username.userId} />
                      <button
                        type="submit"
                        className={`button${isFollowing || isFollowRequestPending ? " buttonSecondary" : ""}`}
                        aria-pressed={isFollowing}
                        title={isFollowRequestPending ? "Cancel follow request" : undefined}
                      >
                        {isFollowing ? "Following" : isFollowRequestPending ? "Requested" : "Follow"}
                      </button>
                    </form>
                    {/* Reachable regardless of follow state — this is the
                        entry point for phase-2 spec §5.2's "message
                        request" path (a DM to someone who doesn't follow
                        you back), since there's no global user search yet
                        to reach a non-followed account any other way.
                        Hidden only when the viewer has blocked this account
                        (blockedByViewer) — sending would just be rejected
                        server-side, per the same check in sendMessage. */}
                    {!blockedByViewer && (
                      <Link href={`/messages/new?to=${username.userId}`} className="button buttonSecondary">
                        Message
                      </Link>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {profile.bio && <p className="profileBio">{profile.bio}</p>}

      {/* Share and Block are real but secondary (spec §3.4 calls Share
          "togglable via a share sheet", not a primary action) — grouped
          into one row below the bio instead of competing with the
          Follow/Message/Edit actions up in the header. */}
      <div className="profileUtilityRow">
        <details className="profileEditToggle">
          <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
            Share
          </summary>
          <div className="row-lg" style={{ marginTop: "0.85rem", flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- server-generated SVG route, not a static asset */}
            <img src={`/qr/${username.handle}`} alt={`QR code for ${profileUrl}`} width={120} height={120} style={{ borderRadius: "12px", background: "#fff" }} />
            <div className="stack">
              <span className="mutedText">{profileUrl}</span>
              <CopyLinkButton url={profileUrl} />
            </div>
          </div>
        </details>

        {canTip && (
          <details className="profileEditToggle">
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
              Send a tip
            </summary>
            <div style={{ marginTop: "0.6rem" }}>
              <TipForm creatorHandle={username.handle} cardAvailable={cardAvailable} viewerCoins={viewerCoins} />
            </div>
          </details>
        )}

        {/* Everything below needs its own queries (tiers, products,
            portfolio content, courses, podcast, newsletter, livestreams,
            affiliate programs) — none of it is needed to paint the header
            above, so it's deferred behind Suspense rather than blocking
            TTFB on ~15 more round trips. */}
        <Suspense fallback={null}>
          <ProfileMonetizationAndPortfolio
            profile={profile}
            username={username}
            currentUser={currentUser}
            isOwner={isOwner}
            showViewerControls={showViewerControls}
            canViewFullProfile={canViewFullProfile}
            canSubscribe={canSubscribe}
            canBuy={canBuy}
            cardAvailable={cardAvailable}
            viewerCoins={viewerCoins}
          />
        </Suspense>

        {/* phase-12 spec §4.1: the generic report action, reused here for
            account-level reports the same way PostCard reuses it for
            content reports — one ReportButton, every subjectType. */}
        {showViewerControls && !blockedByViewer && <ReportButton subjectType="user" subjectId={username.userId} />}

        {showViewerControls && (
          blockedByViewer ? (
            <form action={unblockUser}>
              <input type="hidden" name="blockedId" value={username.userId} />
              <button type="submit" className="button buttonSecondary buttonSmall">
                Unblock @{username.handle}
              </button>
            </form>
          ) : (
            <details className="profileEditToggle">
              <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
                Block @{username.handle}
              </summary>
              <div className="disclosureBody">
                <p className="mutedText" style={{ fontSize: "0.85rem" }}>
                  Removes any follow between you, hides their notifications
                  from you going forward, and stops suggesting them to
                  you. You can unblock them later.
                </p>
                <form action={blockUser}>
                  <input type="hidden" name="blockedId" value={username.userId} />
                  <button type="submit" className="button buttonDanger buttonSmall">
                    Yes, block @{username.handle}
                  </button>
                </form>
              </div>
            </details>
          )
        )}
      </div>

      {canViewFullProfile && recentTips.length > 0 && (
        <div className="stack" style={{ marginTop: "0.75rem" }}>
          <p className="sectionHeading">Recent tips</p>
          {recentTips.map((tip) => (
            <p key={tip.id} className="mutedText" style={{ fontSize: "0.85rem" }}>
              {tip.fromUser.username ? (
                <Link href={`/${tip.fromUser.username.handle}`}>
                  {tip.fromUser.profile?.displayName ?? tip.fromUser.username.handle}
                </Link>
              ) : (
                "Someone"
              )}
              {" tipped $"}
              {tip.amount.toFixed(2)}
              {tip.message ? `: "${tip.message}"` : ""}
            </p>
          ))}
        </div>
      )}

      {canViewFullProfile && profile.socialLinks.length > 0 && (
        <div className="socialLinksRow">
          {profile.socialLinks.map((social) => (
            <a
              key={social.id}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="socialIconLink"
              aria-label={getSocialPlatformLabel(social.platform)}
              title={getSocialPlatformLabel(social.platform)}
            >
              <SocialIcon platform={social.platform as SocialPlatform} />
            </a>
          ))}
        </div>
      )}

      {!canViewFullProfile ? (
        <EmptyState
          message={
            isFollowRequestPending
              ? `This account is private. Your follow request to @${username.handle} is pending approval.`
              : `This account is private. Follow @${username.handle} to see their posts and links.`
          }
        />
      ) : (
        <>
          <div className="linksSection">
            {visibleLinks.length > 0 && <p className="sectionHeading">Links</p>}
            {visibleLinks.length === 0 && (
              <EmptyState
                icon={LinkIcon}
                title={isOwner ? "No links yet" : "No links to show"}
                description={
                  isOwner ? "Add the links you want people to find — your site, socials, anything." : undefined
                }
                action={
                  isOwner ? (
                    <Link href={`/s/${username.handle}/links`} className="button buttonSecondary buttonSmall">
                      Add a link
                    </Link>
                  ) : undefined
                }
              />
            )}
            {visibleLinks.map((link) => (
              <div
                key={link.id}
                className={`profileLinkItem${link.isFeatured ? " featuredLink" : ""}`}
              >
                <a
                  href={`/r/${link.id}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  style={{ flex: 1, fontWeight: 600 }}
                >
                  {link.label}
                </a>
              </div>
            ))}
          </div>

          {/* Posts need their own query (getFeedPosts, plus like/bookmark/
              vote state) — streamed independently of the monetization/
              portfolio Suspense boundary above so a slow podcast or
              affiliate-program query never holds up the post list. */}
          <Suspense fallback={<PostsSkeleton />}>
            <ProfilePosts username={username} currentUser={currentUser} canViewFullProfile={canViewFullProfile} cursor={cursor} />
          </Suspense>
        </>
      )}
    </div>
  );
}

function PostsSkeleton() {
  return (
    <div className="postsSection">
      <p className="sectionHeading">Posts</p>
      <p className="mutedText">Loading posts…</p>
    </div>
  );
}

// Everything a visitor can subscribe to, buy, or browse on this profile
// besides the post list itself — spec §4 (memberships), §5 (digital
// products), §7.1 (affiliate programs), §8 (portfolio sections), §9
// (podcast), §11 (courses), §12 (newsletter), phase-9 §3.2 (freelance
// services), livestreams. None of these block first paint (see the
// Suspense boundary in ProfilePage above), and every independent query
// below runs in one batch rather than the ~15 sequential round trips this
// used to be.
async function ProfileMonetizationAndPortfolio({
  profile,
  username,
  currentUser,
  isOwner,
  showViewerControls,
  canViewFullProfile,
  canSubscribe,
  canBuy,
  cardAvailable,
  viewerCoins,
}: {
  profile: ProfileRecord;
  username: { handle: string; userId: string };
  currentUser: CurrentUser;
  isOwner: boolean;
  showViewerControls: boolean;
  canViewFullProfile: boolean;
  canSubscribe: boolean;
  canBuy: boolean;
  cardAvailable: boolean;
  viewerCoins: number;
}) {
  const [
    activeTiers,
    activeCourses,
    freelanceServiceCount,
    visibleProjects,
    standaloneRepositories,
    connectedContentItems,
    publicResearchPapers,
    publicCertificates,
    publicAwards,
    endorsementRows,
    podcast,
    newsletterIssueCount,
    newsletterSubscriptionCount,
    liveLivestreams,
    activeProducts,
    viewerTierAccessRows,
    activeAffiliatePrograms,
  ] = await Promise.all([
    canSubscribe
      ? db.membershipTier.findMany({ where: { creatorId: username.userId, status: "active" }, orderBy: { level: "asc" } })
      : Promise.resolve([]),
    // spec §11: a lightweight discovery list — the course's own page
    // (/[username]/courses/[courseId]) is where purchase/access/lesson
    // content actually lives, this is just "here's what's for sale."
    canViewFullProfile
      ? db.course.findMany({
          where: { creatorId: username.userId, status: "active" },
          select: { id: true, title: true, price: true, currency: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    // phase-9 spec §3.2: a lightweight discovery link to the full storefront/
    // booking page — same "here's what's for sale, full page has the actual
    // checkout/booking flow" posture as activeCourses above.
    canViewFullProfile ? db.offering.count({ where: { sellerUserId: username.userId, status: "active" } }) : Promise.resolve(0),
    // spec §3.3: unlisted projects are excluded from this listing (still
    // resolve directly at /p/{slug} — see that page) unless the viewer is the
    // owner, same "owner sees everything, everyone else sees only what's
    // meant to be public" posture pending businesses use.
    canViewFullProfile
      ? db.project.findMany({
          where: {
            ownerId: username.userId,
            status: { not: "archived" },
            ...(isOwner ? {} : { visibility: "public" }),
          },
          select: { id: true, slug: true, title: true, summary: true, likeCount: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    canViewFullProfile
      ? db.gitRepository.findMany({ where: { profileId: profile.id, projectId: null } })
      : Promise.resolve([]),
    // Connected content: cached items pulled in from the owner's connected
    // external accounts (social-content-sync.ts).
    canViewFullProfile
      ? db.externalContentItem.findMany({
          where: { externalAccount: { profileId: profile.id } },
          include: { externalAccount: { select: { platform: true } } },
          orderBy: { publishedAt: "desc" },
          take: 24,
        })
      : Promise.resolve([]),
    canViewFullProfile ? db.researchPaper.findMany({ where: { profileId: profile.id }, orderBy: { publishDate: "desc" } }) : Promise.resolve([]),
    canViewFullProfile ? db.certificate.findMany({ where: { profileId: profile.id }, orderBy: { issueDate: "desc" } }) : Promise.resolve([]),
    canViewFullProfile ? db.award.findMany({ where: { profileId: profile.id }, orderBy: { awardedDate: "desc" } }) : Promise.resolve([]),
    // spec §4.1/§4.2: any logged-in, non-owner viewer may endorse — this set
    // just drives the endorsed/not-endorsed button state for this viewer.
    currentUser && !isOwner && profile.skills.length > 0
      ? db.skillEndorsement.findMany({
          where: { endorserId: currentUser.id, skillId: { in: profile.skills.map((s) => s.id) } },
          select: { skillId: true },
        })
      : Promise.resolve([]),
    // spec §9: the podcast's episode list.
    canViewFullProfile
      ? db.podcast.findFirst({
          where: { creatorId: username.userId },
          include: { episodes: { orderBy: { episodeNumber: "asc" }, include: { requiredTier: { select: { name: true } } } } },
        })
      : Promise.resolve(null),
    // spec §12: newsletter has no in-app producer of its own (delivered via
    // email), so this section is just the subscribe form — matching §10.1's
    // subscriber-list privacy (only the creator sees who's subscribed).
    canViewFullProfile ? db.newsletterIssue.count({ where: { creatorId: username.userId } }) : Promise.resolve(0),
    canViewFullProfile ? db.newsletterSubscription.count({ where: { creatorId: username.userId } }) : Promise.resolve(0),
    canViewFullProfile
      ? db.livestream.findMany({
          where: { creatorId: username.userId, status: { in: ["live", "scheduled"] } },
          orderBy: { createdAt: "desc" },
          include: { requiredTier: { select: { name: true } } },
        })
      : Promise.resolve([]),
    canBuy
      ? db.digitalProduct.findMany({ where: { creatorId: username.userId, status: "active" }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    canSubscribe && currentUser
      ? db.membershipSubscription.findMany({
          where: {
            fanId: currentUser.id,
            tier: { creatorId: username.userId },
            OR: [{ status: "active" }, { status: "cancelled", currentPeriodEnd: { gt: new Date() } }],
          },
          select: { tierId: true },
        })
      : Promise.resolve([]),
    // spec §7.1: a non-owner signed-in visitor can become an affiliate for
    // any of this creator's active programs.
    showViewerControls && canViewFullProfile && currentUser
      ? db.affiliateProgram.findMany({
          where: { creatorId: username.userId, status: "active" },
          include: { links: { where: { affiliateId: currentUser.id }, select: { id: true, code: true } } },
        })
      : Promise.resolve([]),
  ]);

  const endorsedSkillIds = new Set(endorsementRows.map((e) => e.skillId));
  const hasFreelanceServices = freelanceServiceCount > 0;
  const hasNewsletter = newsletterIssueCount > 0 || newsletterSubscriptionCount > 0;
  const viewerTierAccessIds = new Set(viewerTierAccessRows.map((s) => s.tierId));
  const subscribableTiers = activeTiers.filter((t) => !viewerTierAccessIds.has(t.id));

  // ownedProductIds and the affiliate offering labels both depend on the
  // batch above (product ids / program list), so they run as a second,
  // smaller parallel step rather than folding into it.
  const [ownedProductRows, affiliateOfferingLabels] = await Promise.all([
    canBuy && currentUser
      ? db.digitalProductPurchase.findMany({
          where: { buyerId: currentUser.id, productId: { in: activeProducts.map((p) => p.id) } },
          select: { productId: true },
        })
      : Promise.resolve([]),
    resolveAffiliateOfferingLabels(activeAffiliatePrograms),
  ]);
  const ownedProductIds = new Set(ownedProductRows.map((p) => p.productId));

  // spec §8: the seven new phase-6 sections render in the owner-chosen
  // order, skipping any toggled hidden.
  const portfolioLayout = parsePortfolioLayout(profile.portfolioLayoutJson);
  const visiblePortfolioSectionKeys = canViewFullProfile
    ? new Set(portfolioLayout.filter((e) => e.visible).map((e) => e.key))
    : new Set<string>();
  const portfolioSectionOrder = portfolioLayout.map((e) => e.key);

  const projectsSection =
    visibleProjects.length > 0 && visiblePortfolioSectionKeys.has("projects") ? (
      <details className="profileEditToggle">
        <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
          Projects
        </summary>
        <div className="disclosureBody">
          {visibleProjects.map((project) => (
            <Link key={project.id} href={`/p/${project.slug}`} style={{ fontSize: "0.9rem" }}>
              {project.title}
              {project.summary && <span className="mutedText"> — {project.summary}</span>}
            </Link>
          ))}
        </div>
      </details>
    ) : null;

  const skillsSection =
    profile.skills.length > 0 && visiblePortfolioSectionKeys.has("skills") ? (
      <details className="profileEditToggle">
        <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
          Skills
        </summary>
        <div className="disclosureBodyWrap" style={{ maxWidth: "32ch" }}>
          {profile.skills.map((skill) =>
            currentUser && !isOwner ? (
              <form key={skill.id} action={endorseSkill}>
                <input type="hidden" name="skillId" value={skill.id} />
                <button
                  type="submit"
                  className="button buttonSecondary buttonSmall"
                  style={endorsedSkillIds.has(skill.id) ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
                  aria-pressed={endorsedSkillIds.has(skill.id)}
                >
                  {skill.name} · {skill.endorsementCount}
                </button>
              </form>
            ) : (
              <span key={skill.id} className="mutedText" style={{ fontSize: "0.85rem" }}>
                {skill.name} · {skill.endorsementCount}
              </span>
            )
          )}
        </div>
      </details>
    ) : null;

  const repositoriesSection =
    standaloneRepositories.length > 0 && visiblePortfolioSectionKeys.has("repositories") ? (
      <details className="profileEditToggle">
        <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
          Repositories
        </summary>
        <div className="disclosureBody">
          {standaloneRepositories.map((repo) => (
            <a key={repo.id} href={repo.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.9rem" }}>
              {repo.displayName}
              <span className="mutedText">
                {" "}
                {repo.primaryLanguage && `· ${repo.primaryLanguage}`} {repo.starCount !== null && `· ★ ${repo.starCount}`}
              </span>
            </a>
          ))}
        </div>
      </details>
    ) : null;

  const connectedContentSection =
    connectedContentItems.length > 0 && visiblePortfolioSectionKeys.has("connectedContent") ? (
      <details className="profileEditToggle">
        <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
          Connected content
        </summary>
        <div className="disclosureBodyWrap">
          {connectedContentItems.map((item) => (
            <a key={item.id} href={item.contentUrl} target="_blank" rel="noopener noreferrer" style={{ width: "120px" }}>
              {item.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- stub/external thumbnail, not an optimizable local asset
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  style={{ width: "120px", height: "68px", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--border)" }}
                />
              )}
              <span className="row-sm" style={{ marginTop: "0.3rem", fontSize: "0.8rem" }}>
                <SocialIcon platform={item.externalAccount.platform as SocialPlatform} />
                {item.title}
              </span>
            </a>
          ))}
        </div>
      </details>
    ) : null;

  const papersSection =
    publicResearchPapers.length > 0 && visiblePortfolioSectionKeys.has("papers") ? (
      <details className="profileEditToggle">
        <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
          Research papers
        </summary>
        <div className="disclosureBody">
          {publicResearchPapers.map((paper) => (
            <div key={paper.id} style={{ fontSize: "0.9rem" }}>
              <strong>{paper.title}</strong>
              <p className="mutedText" style={{ margin: "0.1rem 0 0", fontSize: "0.8rem" }}>
                {paper.authors}
                {paper.venue && ` · ${paper.venue}`}
              </p>
              <span className="row" style={{ marginTop: "0.15rem" }}>
                {paper.doiOrUrl && <a href={paper.doiOrUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8rem" }}>DOI/Link</a>}
                {paper.fileUrl && <a href={paper.fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8rem" }}>PDF</a>}
              </span>
            </div>
          ))}
        </div>
      </details>
    ) : null;

  const certificatesSection =
    publicCertificates.length > 0 && visiblePortfolioSectionKeys.has("certificates") ? (
      <details className="profileEditToggle">
        <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
          Certificates
        </summary>
        <div className="disclosureBody">
          {publicCertificates.map((cert) => (
            <div key={cert.id} style={{ fontSize: "0.9rem" }}>
              {cert.credentialUrl ? (
                <a href={cert.credentialUrl} target="_blank" rel="noopener noreferrer"><strong>{cert.title}</strong></a>
              ) : (
                <strong>{cert.title}</strong>
              )}
              <span className="mutedText"> — {cert.issuingOrg}</span>
            </div>
          ))}
        </div>
      </details>
    ) : null;

  const awardsSection =
    publicAwards.length > 0 && visiblePortfolioSectionKeys.has("awards") ? (
      <details className="profileEditToggle">
        <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
          Awards
        </summary>
        <div className="disclosureBody">
          {publicAwards.map((award) => (
            <div key={award.id} style={{ fontSize: "0.9rem" }}>
              {award.link ? (
                <a href={award.link} target="_blank" rel="noopener noreferrer"><strong>{award.title}</strong></a>
              ) : (
                <strong>{award.title}</strong>
              )}
              {award.issuingOrg && <span className="mutedText"> — {award.issuingOrg}</span>}
            </div>
          ))}
        </div>
      </details>
    ) : null;

  const portfolioSectionsByKey: Record<string, ReactNode> = {
    projects: projectsSection,
    skills: skillsSection,
    repositories: repositoriesSection,
    papers: papersSection,
    certificates: certificatesSection,
    awards: awardsSection,
    connectedContent: connectedContentSection,
  };
  const orderedPortfolioSections = portfolioSectionOrder
    .filter((key) => key !== "resume")
    .map((key) => <Fragment key={key}>{portfolioSectionsByKey[key]}</Fragment>);

  return (
    <>
      {canSubscribe && (subscribableTiers.length > 0 || viewerTierAccessIds.size > 0) && (
        <details className="profileEditToggle">
          <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
            Memberships
          </summary>
          <div className="disclosureBody">
            {activeTiers.map((tier) =>
              viewerTierAccessIds.has(tier.id) ? (
                <p key={tier.id} className="mutedText row-sm" style={{ fontSize: "0.85rem" }}>
                  <Check size={14} aria-hidden="true" /> Subscribed — {tier.name}
                </p>
              ) : (
                <div key={tier.id}>
                  <p style={{ fontWeight: 600, fontSize: "0.9rem", margin: 0 }}>{tier.name}</p>
                  {tier.description && <p className="mutedText" style={{ fontSize: "0.8rem", margin: "0.15rem 0" }}>{tier.description}</p>}
                  <SubscribeForm tier={tier} cardAvailable={cardAvailable} viewerCoins={viewerCoins} />
                </div>
              )
            )}
          </div>
        </details>
      )}

      {canBuy && activeProducts.length > 0 && (
        <details className="profileEditToggle">
          <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
            Digital products
          </summary>
          <div className="disclosureBody">
            {activeProducts.map((product) => (
              <DigitalProductCard key={product.id} product={product} owned={ownedProductIds.has(product.id)} cardAvailable={cardAvailable} viewerCoins={viewerCoins} />
            ))}
          </div>
        </details>
      )}

      {orderedPortfolioSections}

      {hasFreelanceServices && (
        <Link href={`/${username.handle}/services`} className="profileEditToggle">
          Services →
        </Link>
      )}

      {activeCourses.length > 0 && (
        <details className="profileEditToggle">
          <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
            Courses
          </summary>
          <div className="disclosureBody">
            {activeCourses.map((course) => (
              <Link key={course.id} href={`/${username.handle}/courses/${course.id}`} style={{ fontSize: "0.9rem" }}>
                {course.title}
                {course.price !== null && course.currency !== null && (
                  <span className="mutedText"> — {course.price.toFixed(2)} {course.currency.toUpperCase()}</span>
                )}
              </Link>
            ))}
          </div>
        </details>
      )}

      {podcast && podcast.episodes.length > 0 && (
        <details className="profileEditToggle">
          <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
            Podcast
          </summary>
          <div style={{ marginTop: "0.6rem", maxWidth: "32ch" }}>
            <PodcastEpisodesList
              podcastId={podcast.id}
              rssSlug={podcast.rssSlug}
              episodes={podcast.episodes.map((ep) => ({
                id: ep.id,
                title: ep.title,
                description: ep.description,
                requiredTierId: ep.requiredTierId,
                requiredTierName: ep.requiredTier?.name,
              }))}
              isSignedIn={!!currentUser}
            />
          </div>
        </details>
      )}

      {hasNewsletter && !isOwner && (
        <details className="profileEditToggle">
          <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
            Newsletter
          </summary>
          <div style={{ marginTop: "0.6rem", maxWidth: "32ch" }}>
            <NewsletterSubscribeForm creatorId={username.userId} defaultEmail={currentUser?.email} />
          </div>
        </details>
      )}

      {liveLivestreams.length > 0 && (
        <details className="profileEditToggle" open={liveLivestreams.some((l) => l.status === "live")}>
          <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
            Livestreams
          </summary>
          <div className="disclosureBody">
            {liveLivestreams.map((live) => (
              <Link key={live.id} href={`/live/${live.id}`} style={{ fontSize: "0.9rem" }}>
                {live.status === "live" ? "🔴 " : ""}
                {live.title}
                <span className="mutedText">
                  {" "}
                  — {live.status}
                  {live.requiredTierId && live.requiredTier && ` · ${live.requiredTier.name}+ only`}
                </span>
              </Link>
            ))}
          </div>
        </details>
      )}

      {activeAffiliatePrograms.length > 0 && (
        <details className="profileEditToggle">
          <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
            Affiliate program
          </summary>
          <div className="disclosureBody">
            {activeAffiliatePrograms.map((program) =>
              program.links.length > 0 ? (
                <p key={program.id} className="mutedText row-sm" style={{ fontSize: "0.85rem" }}>
                  <Check size={14} aria-hidden="true" /> Your link: /aff/{program.links[0].code}
                </p>
              ) : (
                <BecomeAffiliateForm
                  key={program.id}
                  programId={program.id}
                  offeringLabel={affiliateOfferingLabels.get(program.id) ?? "this offering"}
                  commissionPercent={program.commissionPercent}
                />
              )
            )}
          </div>
        </details>
      )}
    </>
  );
}

// The post list — reuses getFeedPosts (src/lib/feed-query.ts) scoped to
// this one author, same block/private-community/pending-business
// visibility filtering as Home/Explore/Trending, since this is just as
// much a public-facing post list as those surfaces are.
async function ProfilePosts({
  username,
  currentUser,
  canViewFullProfile,
  cursor,
}: {
  username: { handle: string; userId: string };
  currentUser: CurrentUser;
  canViewFullProfile: boolean;
  cursor: ReturnType<typeof parseCursor>;
}) {
  const { items: posts, nextCursor } = canViewFullProfile
    ? await getFeedPosts({
        authorFilter: { authorId: { in: [username.userId] } },
        cursor,
        viewerId: currentUser?.id ?? null,
      })
    : { items: [], nextCursor: null };

  const postIds = posts.map((p) => p.id);
  const [likedPostIds, bookmarkedPostIds, votedOptionIds] = await Promise.all([
    currentUser
      ? db.postLike.findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } }).then((rows) => new Set(rows.map((r) => r.postId)))
      : Promise.resolve(new Set<string>()),
    currentUser
      ? db.bookmark.findMany({ where: { userId: currentUser.id, postId: { in: postIds } }, select: { postId: true } }).then((rows) => new Set(rows.map((r) => r.postId)))
      : Promise.resolve(new Set<string>()),
    getVotedPollOptionIds(currentUser?.id, posts),
  ]);

  return (
    <div className="postsSection">
      <ScrollToHashPost />
      <p className="sectionHeading">Posts</p>
      {posts.length === 0 && (
        <EmptyState
          icon={Newspaper}
          title="No posts yet"
          description={
            currentUser?.id === username.userId
              ? "Share an update from your feed and it'll show up here."
              : undefined
          }
        />
      )}
      <div className="itemStack">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            isLiked={likedPostIds.has(post.id)}
            isBookmarked={bookmarkedPostIds.has(post.id)}
            isOwner={currentUser?.id === post.authorId}
            currentUserId={currentUser?.id}
            votedOptionIds={votedOptionIds}
          />
        ))}
      </div>
      {nextCursor && (
        <Link href={`/${username.handle}?cursor=${encodeURIComponent(nextCursor)}`} className="button buttonSecondary loadMoreLink">
          Load more
        </Link>
      )}
    </div>
  );
}
