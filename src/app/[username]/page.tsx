import { Fragment } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { BadgeCheck, Check } from "lucide-react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { followUser, unfollowUser } from "@/app/actions/follow";
import { blockUser, unblockUser } from "@/app/actions/block";
import { ReportButton } from "@/components/ReportButton";
import { isBlocked } from "@/lib/blocks";
import { getThemePreset, getSocialPlatformLabel, type SocialPlatform } from "@/lib/theme-presets";
import { getFeedPosts, getVotedPollOptionIds } from "@/lib/feed-query";
import { parseCursor } from "@/lib/pagination";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
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
// the plain gradient .profileCoverPlaceholder) — per explicit direction,
// same asset already live under kingofyadav's profile.
const DEFAULT_COVER_URL = "/uploads/8b52a1d822e19f974165b7498189eb36.jpg";

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

  const username = await db.username.findUnique({
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

  if (!username || !username.user.profile) {
    notFound();
  }

  const profile = username.user.profile;
  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === username.userId;

  const [followRow, blockedByViewer, viewerBlockedByOwner] =
    currentUser && !isOwner
      ? await Promise.all([
          db.follow.findUnique({
            where: { followerId_followeeId: { followerId: currentUser.id, followeeId: username.userId } },
            select: { status: true },
          }),
          isBlocked(currentUser.id, username.userId),
          isBlocked(username.userId, currentUser.id),
        ])
      : [null, false, false];
  // Only an "accepted" row counts as isFollowing (see followUser/
  // acceptFollowRequest, src/app/actions/follow.ts) — a "pending" row (a
  // request against a private account awaiting approval) must never itself
  // grant follower-only access, or a private account's whole approval gate
  // would be moot: anyone could unlock it just by clicking Follow once.
  const isFollowing = followRow?.status === "accepted";
  const isFollowRequestPending = followRow?.status === "pending";
  // If the owner has blocked the viewer, no Follow/Block controls render at
  // all — quietly, matching how most platforms don't advertise block state.
  const showViewerControls = currentUser && !isOwner && !viewerBlockedByOwner;

  // Settings-page "Private profile" toggle (§ EditProfileForm): a visitor
  // who is neither the owner nor an accepted follower only ever sees
  // identity (avatar/name/bio) plus the Follow control — every content
  // surface below (posts, links, portfolio, monetization) stays gated
  // behind this, same posture as Instagram/Twitter private accounts.
  const canViewFullProfile = isOwner || !profile.isPrivate || isFollowing;

  // spec §6: tipping gated on the profile owner having an active payout
  // account (spec §3.5's literal criterion, re-checked here rather than
  // trusted from any client state). Recent public tip messages (§13.2's
  // one deliberate "financial data is public by default" exception) shown
  // underneath, same read as any other public profile content.
  const [payoutAccount, recentTips] = await Promise.all([
    db.creatorPayoutAccount.findUnique({ where: { userId: username.userId }, select: { status: true } }),
    db.tip.findMany({
      where: { toCreatorId: username.userId, message: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { fromUser: { include: { username: true, profile: true } } },
    }),
  ]);
  const canTip = showViewerControls && canViewFullProfile && payoutAccount?.status === "active";

  // spec §4: only active tiers are ever offered on the public profile
  // (archived tiers stay visible to the owner on /s/[username] for
  // reactivation, never here), and only once the creator has payouts
  // enabled — same gate canTip already applies for a different money-moving
  // feature. A tier the viewer already has effectively active access to
  // (see tier-access.ts's same status+currentPeriodEnd check) is excluded
  // from the offer list — no point re-selling it.
  const canSubscribe = showViewerControls && canViewFullProfile && payoutAccount?.status === "active";
  const activeTiers = canSubscribe
    ? await db.membershipTier.findMany({ where: { creatorId: username.userId, status: "active" }, orderBy: { level: "asc" } })
    : [];
  const viewerTierAccessIds =
    canSubscribe && currentUser
      ? new Set(
          (
            await db.membershipSubscription.findMany({
              where: {
                fanId: currentUser.id,
                tier: { creatorId: username.userId },
                OR: [{ status: "active" }, { status: "cancelled", currentPeriodEnd: { gt: new Date() } }],
              },
              select: { tierId: true },
            })
          ).map((s) => s.tierId)
        )
      : new Set<string>();
  const subscribableTiers = activeTiers.filter((t) => !viewerTierAccessIds.has(t.id));

  // spec §11: a lightweight discovery list — the course's own page
  // (/[username]/courses/[courseId]) is where purchase/access/lesson
  // content actually lives, this is just "here's what's for sale."
  const activeCourses = canViewFullProfile
    ? await db.course.findMany({
        where: { creatorId: username.userId, status: "active" },
        select: { id: true, title: true, price: true, currency: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // phase-9 spec §3.2: a lightweight discovery link to the full storefront/
  // booking page — same "here's what's for sale, full page has the actual
  // checkout/booking flow" posture as activeCourses above.
  const hasFreelanceServices =
    canViewFullProfile && (await db.offering.count({ where: { sellerUserId: username.userId, status: "active" } })) > 0;

  // spec §3.3: unlisted projects are excluded from this listing (still
  // resolve directly at /p/{slug} — see that page) unless the viewer is the
  // owner, same "owner sees everything, everyone else sees only what's
  // meant to be public" posture pending businesses use. A private profile
  // (canViewFullProfile false) hides the whole list from a non-follower,
  // same as every other content surface below.
  const visibleProjects = canViewFullProfile
    ? await db.project.findMany({
        where: {
          ownerId: username.userId,
          status: { not: "archived" },
          ...(isOwner ? {} : { visibility: "public" }),
        },
        select: { id: true, slug: true, title: true, summary: true, likeCount: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // spec §4.1/§4.2: any logged-in, non-owner viewer may endorse — this set
  // just drives the endorsed/not-endorsed button state for this viewer.
  const standaloneRepositories = canViewFullProfile
    ? await db.gitRepository.findMany({
        where: { profileId: profile.id, projectId: null },
      })
    : [];

  const [publicResearchPapers, publicCertificates, publicAwards] = canViewFullProfile
    ? await Promise.all([
        db.researchPaper.findMany({ where: { profileId: profile.id }, orderBy: { publishDate: "desc" } }),
        db.certificate.findMany({ where: { profileId: profile.id }, orderBy: { issueDate: "desc" } }),
        db.award.findMany({ where: { profileId: profile.id }, orderBy: { awardedDate: "desc" } }),
      ])
    : [[], [], []];

  const endorsedSkillIds =
    currentUser && !isOwner && profile.skills.length > 0
      ? new Set(
          (
            await db.skillEndorsement.findMany({
              where: { endorserId: currentUser.id, skillId: { in: profile.skills.map((s) => s.id) } },
              select: { skillId: true },
            })
          ).map((e) => e.skillId)
        )
      : new Set<string>();

  // spec §8: the seven new phase-6 sections render in the owner-chosen
  // order, skipping any toggled hidden — the one genuinely new rendering
  // pattern this phase introduces (every other section on this page still
  // renders in the fixed sequence phases 1-5 established, per the plan's
  // narrow scoping of this to just the sections built in this phase).
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
        <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.4rem", maxWidth: "32ch" }}>
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
        <div style={{ marginTop: "0.6rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", maxWidth: "32ch" }}>
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
        <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.4rem", maxWidth: "32ch" }}>
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

  const papersSection =
    publicResearchPapers.length > 0 && visiblePortfolioSectionKeys.has("papers") ? (
      <details className="profileEditToggle">
        <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
          Research papers
        </summary>
        <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
          {publicResearchPapers.map((paper) => (
            <div key={paper.id} style={{ fontSize: "0.9rem" }}>
              <strong>{paper.title}</strong>
              <p className="mutedText" style={{ margin: "0.1rem 0 0", fontSize: "0.8rem" }}>
                {paper.authors}
                {paper.venue && ` · ${paper.venue}`}
              </p>
              <span style={{ display: "flex", gap: "0.5rem", marginTop: "0.15rem" }}>
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
        <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.4rem", maxWidth: "32ch" }}>
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
        <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.4rem", maxWidth: "32ch" }}>
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
  };
  const orderedPortfolioSections = portfolioSectionOrder
    .filter((key) => key !== "resume")
    .map((key) => <Fragment key={key}>{portfolioSectionsByKey[key]}</Fragment>);

  // spec §8.1: a section toggled hidden doesn't render even if the
  // underlying rows still exist — the Resume header link is the one
  // phase-6 section that isn't a <details> block in this row, so its
  // visibility is applied at the link itself rather than through
  // portfolioSectionsByKey above.
  const showResumeLink = visiblePortfolioSectionKeys.has("resume");

  // spec §5: same canSubscribe-style gate — only offered once the creator
  // has payouts enabled. ownedProductIds marks which active products the
  // viewer already bought, so DigitalProductCard renders a Download control
  // instead of a Buy form for those.
  const canBuy = showViewerControls && canViewFullProfile && payoutAccount?.status === "active";
  const activeProducts = canBuy
    ? await db.digitalProduct.findMany({ where: { creatorId: username.userId, status: "active" }, orderBy: { createdAt: "desc" } })
    : [];
  const ownedProductIds =
    canBuy && currentUser
      ? new Set(
          (
            await db.digitalProductPurchase.findMany({
              where: { buyerId: currentUser.id, productId: { in: activeProducts.map((p) => p.id) } },
              select: { productId: true },
            })
          ).map((p) => p.productId)
        )
      : new Set<string>();

  // spec §9: the podcast's episode list — a free episode plays with no
  // gate at all; a member-only one is labeled but still listed (not
  // hidden entirely), matching how gated posts render elsewhere as a
  // visible-but-locked item rather than disappearing outright... except
  // podcasts have no "locked teaser" UI yet, so PodcastEpisodesList's Play
  // button is what actually enforces the gate server-side, per spec §9.3.
  const podcast = canViewFullProfile
    ? await db.podcast.findFirst({
        where: { creatorId: username.userId },
        include: { episodes: { orderBy: { episodeNumber: "asc" }, include: { requiredTier: { select: { name: true } } } } },
      })
    : null;

  // spec §12: newsletter has no in-app producer of its own (delivered via
  // email), so this section is just the subscribe form — no "recent
  // issues" list here, matching §10.1's subscriber-list privacy (only the
  // creator sees who's subscribed, never public).
  const hasNewsletter = canViewFullProfile && (
    (await db.newsletterIssue.count({ where: { creatorId: username.userId } })) > 0
    || (await db.newsletterSubscription.count({ where: { creatorId: username.userId } })) > 0
  );

  const liveLivestreams = canViewFullProfile
    ? await db.livestream.findMany({
        where: { creatorId: username.userId, status: { in: ["live", "scheduled"] } },
        orderBy: { createdAt: "desc" },
        include: { requiredTier: { select: { name: true } } },
      })
    : [];

  // spec §7.1: a non-owner signed-in visitor can become an affiliate for
  // any of this creator's active programs — the one discovery surface this
  // build gives affiliate programs (no separate marketplace/browse page,
  // out of scope per §7.1's "deliberately narrow" framing).
  const activeAffiliatePrograms =
    showViewerControls && canViewFullProfile && currentUser
      ? await db.affiliateProgram.findMany({
          where: { creatorId: username.userId, status: "active" },
          include: {
            links: { where: { affiliateId: currentUser.id }, select: { id: true, code: true } },
          },
        })
      : [];
  const affiliateOfferingLabels = await resolveAffiliateOfferingLabels(activeAffiliatePrograms);

  const { cursor: rawCursor } = await searchParams;
  const cursor = parseCursor(rawCursor);
  // Reuses getFeedPosts (src/lib/feed-query.ts) scoped to this one author —
  // same block/private-community/pending-business visibility filtering as
  // Home/Explore/Trending, since this is just as much a public-facing post
  // list as those surfaces are.
  const { items: posts, nextCursor } = canViewFullProfile
    ? await getFeedPosts({
        authorFilter: { authorId: { in: [username.userId] } },
        cursor,
        viewerId: currentUser?.id ?? null,
      })
    : { items: [], nextCursor: null };

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

  const now = new Date();
  const visibleLinks = !canViewFullProfile
    ? []
    : profile.links
    .filter((link) => {
      if (isOwner) return true; // owners see scheduled links too, managed at /s/{handle}
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
        {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset */}
        <img src={profile.coverUrl ?? DEFAULT_COVER_URL} alt="" className="profileCoverImg" />
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
          <div style={{ marginTop: "0.85rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- server-generated SVG route, not a static asset */}
            <img src={`/qr/${username.handle}`} alt={`QR code for ${profileUrl}`} width={120} height={120} style={{ borderRadius: "12px", background: "#fff" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
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
              <TipForm creatorHandle={username.handle} />
            </div>
          </details>
        )}

        {canSubscribe && (subscribableTiers.length > 0 || viewerTierAccessIds.size > 0) && (
          <details className="profileEditToggle">
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>
              Memberships
            </summary>
            <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
              {activeTiers.map((tier) =>
                viewerTierAccessIds.has(tier.id) ? (
                  <p key={tier.id} className="mutedText" style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
                    <Check size={14} aria-hidden="true" /> Subscribed — {tier.name}
                  </p>
                ) : (
                  <div key={tier.id}>
                    <p style={{ fontWeight: 600, fontSize: "0.9rem", margin: 0 }}>{tier.name}</p>
                    {tier.description && <p className="mutedText" style={{ fontSize: "0.8rem", margin: "0.15rem 0" }}>{tier.description}</p>}
                    <SubscribeForm tier={tier} />
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
            <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: "32ch" }}>
              {activeProducts.map((product) => (
                <DigitalProductCard key={product.id} product={product} owned={ownedProductIds.has(product.id)} />
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
            <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.4rem", maxWidth: "32ch" }}>
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
            <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.4rem", maxWidth: "32ch" }}>
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
            <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32ch" }}>
              {activeAffiliatePrograms.map((program) =>
                program.links.length > 0 ? (
                  <p key={program.id} className="mutedText" style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
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
              <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.6rem", maxWidth: "32ch" }}>
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
        <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
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
          <p className="mutedText">No links yet.</p>
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

      <div className="postsSection">
        <p className="sectionHeading">Posts</p>
        {posts.length === 0 && <EmptyState message="No posts yet." />}
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
          <Link
            href={`/${username.handle}?cursor=${encodeURIComponent(nextCursor)}`}
            className="button buttonSecondary loadMoreLink"
          >
            Load more
          </Link>
        )}
      </div>
      </>
      )}
    </div>
  );
}
