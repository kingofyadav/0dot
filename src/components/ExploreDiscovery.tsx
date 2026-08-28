import Link from "next/link";
import { Users, Briefcase, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { getSuggestedUsers, getPublicSuggestedUsers } from "@/lib/suggested-users";
import { getFolloweeIds } from "@/lib/follow-graph";
import { Avatar } from "@/components/Avatar";
import { UserListItem } from "@/components/UserListItem";
import { Icon } from "@/components/Icon";

// Redesign Phase 2b (docs/specs/phase-0-redesign.md §6). Gives /explore an
// identity beyond a raw chronological post list — people to follow, plus a
// way into Communities and Businesses. Self-contained (its own queries) so
// it can stream on its own <Suspense> boundary above the feed without
// touching ExplorePage's existing batched query.
const PEOPLE_COUNT = 6;
const SPACE_COUNT = 4;

export async function ExploreDiscovery({ viewerId }: { viewerId: string | null }) {
  const [people, followingIds, communities, businesses] = await Promise.all([
    viewerId ? getSuggestedUsers(viewerId, PEOPLE_COUNT) : getPublicSuggestedUsers(PEOPLE_COUNT),
    viewerId ? getFolloweeIds(viewerId) : Promise.resolve<string[]>([]),
    db.community.findMany({
      where: { visibility: "public" },
      orderBy: { memberCount: "desc" },
      take: SPACE_COUNT,
      select: { slug: true, name: true, description: true, avatarUrl: true, memberCount: true },
    }),
    db.business.findMany({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
      take: SPACE_COUNT,
      select: { slug: true, name: true, tagline: true, logoUrl: true },
    }),
  ]);

  const followingSet = new Set(followingIds);

  return (
    <div className="exploreDiscovery">
      {people.length > 0 && (
        <section className="section">
          <div className="exploreSectionHead">
            <span className="eyebrow">People to follow</span>
          </div>
          <div className="explorePeople">
            {people.map((u) => (
              <UserListItem
                key={u.id}
                userId={u.id}
                handle={u.username?.handle ?? null}
                displayName={u.profile?.displayName ?? "Unknown"}
                avatarUrl={u.profile?.avatarUrl ?? null}
                isFollowing={followingSet.has(u.id)}
                isSelf={u.id === viewerId}
                showFollowButton
                showHandle={false}
                compact
              />
            ))}
          </div>
        </section>
      )}

      {communities.length > 0 && (
        <section className="section">
          <div className="exploreSectionHead">
            <span className="eyebrow">
              <Icon as={Users} size="sm" /> Communities
            </span>
            <Link href="/c" className="exploreSectionMore">
              Browse all <Icon as={ArrowRight} size="sm" />
            </Link>
          </div>
          <div className="exploreSpaceGrid">
            {communities.map((c) => (
              <Link key={c.slug} href={`/c/${c.slug}`} className="exploreSpaceCard">
                <Avatar src={c.avatarUrl} alt={c.name} size={36} />
                <span className="exploreSpaceName">{c.name}</span>
                <span className="exploreSpaceMeta">
                  {c.memberCount} member{c.memberCount === 1 ? "" : "s"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {businesses.length > 0 && (
        <section className="section">
          <div className="exploreSectionHead">
            <span className="eyebrow">
              <Icon as={Briefcase} size="sm" /> Businesses
            </span>
            <Link href="/b" className="exploreSectionMore">
              Browse all <Icon as={ArrowRight} size="sm" />
            </Link>
          </div>
          <div className="exploreSpaceGrid">
            {businesses.map((b) => (
              <Link key={b.slug} href={`/b/${b.slug}`} className="exploreSpaceCard">
                <Avatar src={b.logoUrl} alt={b.name} size={36} />
                <span className="exploreSpaceName">{b.name}</span>
                {b.tagline && <span className="exploreSpaceMeta">{b.tagline}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
