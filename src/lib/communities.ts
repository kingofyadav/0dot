import "server-only";
import { db } from "@/lib/db";

// Plain server-only lib, not a "use server" action file — same reasoning as
// blocks.ts/messaging.ts: these queries trust a bare communityId/userId with
// no request-level auth of their own. Callers (Server Components, Server
// Actions) are already authenticated via requireVerifiedUser/getCurrentUser.

export function getCommunityMember(communityId: string, userId: string) {
  return db.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
}

// Only an active owner counts — a pending/former membership row (shouldn't
// exist for an owner in practice, since the creator is always active, but
// defensive rather than assumed) never grants owner-only actions.
export async function isCommunityOwner(communityId: string, userId: string): Promise<boolean> {
  const member = await getCommunityMember(communityId, userId);
  return member?.role === "owner" && member.status === "active";
}

// Owner or moderator, active. Grants mute/ban/unban — NOT appoint/remove
// moderator, transfer ownership, or delete community, which stay
// owner-exclusive (isCommunityOwner) to prevent a moderator from appointing
// allies or removing the owner's own moderators.
export async function isCommunityStaff(communityId: string, userId: string): Promise<boolean> {
  const member = await getCommunityMember(communityId, userId);
  return (member?.role === "owner" || member?.role === "moderator") && member?.status === "active";
}

// phase-8: populates the "host as" picker on /e/new — every community this
// user moderates, same "owner|moderator, active" bar as isCommunityStaff,
// mirrors getPostableBusinesses' role (businesses.ts).
export function getModeratedCommunities(userId: string) {
  return db.community.findMany({
    where: { members: { some: { userId, role: { in: ["owner", "moderator"] }, status: "active" } } },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
}

// phase-3 spec §14: append-only source of truth for the "member growth
// (joins/leaves per day)" analytics metric — the one metric that can't be
// derived from current CommunityMember state, since leaveCommunity/
// banMember hard-delete the row. Only ever logged for a transition that
// actually changes memberCount (a pending join request isn't a "join" yet;
// see call sites in communities.ts for exactly which transitions count).
export function logMembershipEvent(args: {
  communityId: string;
  userId: string;
  type: "join" | "leave";
}): Promise<unknown> {
  return db.communityMembershipEvent.create({
    data: { communityId: args.communityId, userId: args.userId, type: args.type },
  });
}

export type PostCommunityContext = { communityId: string; communitySlug: string; flairId: string | null };

// Shared by createPost and createPollPost (src/app/actions/posts.ts,
// polls.ts) — resolves and validates an optional community/flair pair from
// raw form input in one place, so "who can post here, with what flair" can
// never drift between the two compose flows. Returns null when no
// communityId was submitted at all (not an error — most posts aren't
// scoped to a community).
export async function resolvePostCommunityContext(
  userId: string,
  communityIdRaw: string | null,
  flairIdRaw: string | null
): Promise<{ error: string } | PostCommunityContext | null> {
  if (!communityIdRaw) return null;

  const community = await db.community.findUnique({
    where: { id: communityIdRaw },
    select: { id: true, slug: true },
  });
  if (!community) return { error: "Community not found." };

  // phase-3 spec §4.2: only an active member may post — pending/banned/
  // muted/non-members are all rejected server-side, not just hidden in the UI.
  const membership = await getCommunityMember(community.id, userId);
  if (!membership || membership.status !== "active") {
    return { error: "You must be an active member of this community to post here." };
  }

  let flairId: string | null = null;
  if (flairIdRaw) {
    const flair = await db.communityPostFlair.findFirst({
      where: { id: flairIdRaw, communityId: community.id },
      select: { id: true },
    });
    if (!flair) return { error: "Invalid flair." };
    flairId = flair.id;
  }

  return { communityId: community.id, communitySlug: community.slug, flairId };
}

// phase-3 spec §13: the single choke point every moderator-action write
// site calls through, so the modlog can't silently drift out of sync with
// the actions it's supposed to cover (same role createNotification plays
// for notifications). See the ModAction schema comment for the full
// action-value set and which actions are deliberately not logged.
export function logModAction(args: {
  communityId: string;
  moderatorId: string;
  action: string;
  targetType: "post" | "chat_message" | "user" | "rule" | "wiki_page" | "voice_room";
  targetId: string;
  reason?: string | null;
}): Promise<unknown> {
  return db.modAction.create({
    data: {
      communityId: args.communityId,
      moderatorId: args.moderatorId,
      action: args.action,
      targetType: args.targetType,
      targetId: args.targetId,
      reason: args.reason ?? null,
    },
  });
}
