"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { saveUploadedImage } from "@/lib/uploads";
import { validateCommunitySlugFormat } from "@/lib/reserved-community-slugs";
import { getCommunityMember, isCommunityOwner, isCommunityStaff, logModAction, logMembershipEvent } from "@/lib/communities";
import { softDeletePostAndDecrementCounts } from "@/lib/post-moderation";
import { notifyCommunityUpdate } from "@/lib/notifications";
import type { ActionState } from "@/app/actions/auth";

const VISIBILITY_VALUES = new Set(["public", "restricted", "private"]);
const WIKI_EDIT_POLICY_VALUES = new Set(["moderators", "members"]);

function checkCreateCommunityRateLimit(userId: string): boolean {
  return checkRateLimit(`community:create:user:${userId}`, { max: 5, windowMs: 60 * 60 * 1000 });
}

// phase-3 spec §3.1/§3.2: slug validated the same way Phase 1 usernames
// are (src/lib/reserved-community-slugs.ts), name/description length caps
// mirror the profile bio/display-name caps in src/app/actions/profile.ts —
// no new validation philosophy for this entity.
export async function createCommunity(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();

  if (!checkCreateCommunityRateLimit(user.id)) {
    return { error: "You're creating communities too fast. Please slow down." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const description = String(formData.get("description") ?? "").trim();
  const visibilityRaw = String(formData.get("visibility") ?? "public");
  const visibility = VISIBILITY_VALUES.has(visibilityRaw) ? visibilityRaw : "public";

  if (name.length < 1 || name.length > 80) {
    return { error: "Name must be 1-80 characters." };
  }
  if (description.length > 500) {
    return { error: "Description must be 500 characters or fewer." };
  }

  const slugError = validateCommunitySlugFormat(slug);
  if (slugError === "invalid_format") {
    return { error: "Slug must be 3-40 characters: letters, numbers, underscore only." };
  }
  if (slugError === "reserved") {
    return { error: "That slug is reserved." };
  }

  const existingSlug = await db.community.findUnique({ where: { slug } });
  if (existingSlug) {
    return { error: "That slug is already taken." };
  }

  let avatarUrl: string | undefined;
  const avatarFile = formData.get("avatar");
  if (avatarFile instanceof File && avatarFile.size > 0) {
    const result = await saveUploadedImage(avatarFile);
    if ("error" in result) return { error: result.error };
    avatarUrl = result.url;
  }

  let coverUrl: string | undefined;
  const coverFile = formData.get("cover");
  if (coverFile instanceof File && coverFile.size > 0) {
    const result = await saveUploadedImage(coverFile);
    if ("error" in result) return { error: result.error };
    coverUrl = result.url;
  }

  // Nested create: Community + its owner CommunityMember row in one write —
  // a community without an owner (or an owner row without a community)
  // should never be observable, same "create both or neither" reasoning as
  // Phase 1's signup (Username + Profile together).
  //
  // The findUnique check above closes the common case, but it's a
  // check-then-act race, not a guarantee: two requests for the same slug
  // can both pass that check before either write commits (the avatar/cover
  // uploads above are async I/O, widening the window). The DB's own unique
  // index (`Community.slug`) is the actual guarantee — this catches its
  // violation and reports it the same way as the pre-check, rather than
  // letting a P2002 surface as an unhandled 500.
  let community;
  try {
    community = await db.community.create({
      data: {
        slug,
        name,
        description,
        visibility,
        avatarUrl,
        coverUrl,
        createdBy: user.id,
        members: { create: [{ userId: user.id, role: "owner", status: "active" }] },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "That slug is already taken." };
    }
    throw err;
  }

  redirect(`/c/${community.slug}`);
}

export async function updateCommunity(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");

  const community = await db.community.findUnique({ where: { id: communityId } });
  if (!community) return { error: "Community not found." };
  if (!(await isCommunityOwner(communityId, user.id))) {
    return { error: "Only the owner can edit this community." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const visibilityRaw = String(formData.get("visibility") ?? community.visibility);
  const visibility = VISIBILITY_VALUES.has(visibilityRaw) ? visibilityRaw : community.visibility;
  const wikiEditPolicyRaw = String(formData.get("wikiEditPolicy") ?? community.wikiEditPolicy);
  const wikiEditPolicy = WIKI_EDIT_POLICY_VALUES.has(wikiEditPolicyRaw) ? wikiEditPolicyRaw : community.wikiEditPolicy;

  if (name.length < 1 || name.length > 80) {
    return { error: "Name must be 1-80 characters." };
  }
  if (description.length > 500) {
    return { error: "Description must be 500 characters or fewer." };
  }

  const data: {
    name: string;
    description: string;
    visibility: string;
    wikiEditPolicy: string;
    avatarUrl?: string;
    coverUrl?: string;
  } = {
    name,
    description,
    visibility,
    wikiEditPolicy,
  };

  const avatarFile = formData.get("avatar");
  if (avatarFile instanceof File && avatarFile.size > 0) {
    const result = await saveUploadedImage(avatarFile);
    if ("error" in result) return { error: result.error };
    data.avatarUrl = result.url;
  }

  const coverFile = formData.get("cover");
  if (coverFile instanceof File && coverFile.size > 0) {
    const result = await saveUploadedImage(coverFile);
    if ("error" in result) return { error: result.error };
    data.coverUrl = result.url;
  }

  await db.community.update({ where: { id: communityId }, data });

  revalidatePath(`/c/${community.slug}`);
  revalidatePath(`/c/${community.slug}/manage`);
  redirect(`/c/${community.slug}/manage`);
}

// phase-3 spec §3.1: public joins instantly; restricted queues for
// moderator approval. `private`'s join behavior isn't pinned down by the
// spec's acceptance criteria — treated the same as restricted here (pending,
// needs owner approval), since a private community anyone could join
// unapproved would immediately see all its supposedly member-only content.
export async function joinCommunity(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  if (!communityId) return;

  if (!checkRateLimit(`community:join:user:${user.id}`, { max: 30, windowMs: 5 * 60 * 1000 })) return;

  const community = await db.community.findUnique({ where: { id: communityId } });
  if (!community) return;

  // Any existing row blocks a fresh join — active/pending makes this
  // idempotent, and banned/muted rows block it too (a ban survives here by
  // construction: unbanning is the only thing that deletes the row, see
  // unbanMember below, so there's no path to bypass a ban via re-joining).
  const existing = await getCommunityMember(communityId, user.id);
  if (existing) return;

  const status = community.visibility === "public" ? "active" : "pending";

  await db.communityMember.create({ data: { communityId, userId: user.id, role: "member", status } });
  if (status === "active") {
    await db.community.update({ where: { id: communityId }, data: { memberCount: { increment: 1 } } });
    await logMembershipEvent({ communityId, userId: user.id, type: "join" });
  }

  revalidatePath(`/c/${community.slug}`);
}

// spec §4.2's acceptance criterion ("removing the last moderator/owner...
// must be a deliberate decision, not an accident of role-removal logic"):
// the owner can only stop being owner via transferOwnership (an explicit,
// deliberate action) — leaving is always a no-op for them, same "quiet
// no-op on an invalid action" posture as moveLink/toggleFeatured. Banned
// members are blocked too, so a ban can never be lifted by the banned user
// simply "leaving" — only unbanMember (staff-only) removes the row.
export async function leaveCommunity(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  if (!communityId) return;

  const member = await getCommunityMember(communityId, user.id);
  if (!member || member.role === "owner" || member.status === "banned") return;

  await db.communityMember.delete({ where: { communityId_userId: { communityId, userId: user.id } } });
  if (member.status === "active" || member.status === "muted") {
    await db.community.update({ where: { id: communityId }, data: { memberCount: { decrement: 1 } } });
    await logMembershipEvent({ communityId, userId: user.id, type: "leave" });
  }

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) revalidatePath(`/c/${community.slug}`);
}

async function requirePendingMember(communityId: string, targetUserId: string) {
  const member = await getCommunityMember(communityId, targetUserId);
  if (!member || member.status !== "pending") return null;
  return member;
}

// Staff (owner or moderator) — reviewing join requests is routine
// moderation, same tier as mute/ban, not an owner-exclusive power.
export async function approveJoinRequest(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const targetUserId = String(formData.get("userId") ?? "");
  if (!communityId || !targetUserId) return;
  if (!(await isCommunityStaff(communityId, user.id))) return;

  const pending = await requirePendingMember(communityId, targetUserId);
  if (!pending) return;

  const [, community] = await db.$transaction([
    db.communityMember.update({
      where: { communityId_userId: { communityId, userId: targetUserId } },
      data: { status: "active" },
    }),
    db.community.update({ where: { id: communityId }, data: { memberCount: { increment: 1 } } }),
  ]);
  await logMembershipEvent({ communityId, userId: targetUserId, type: "join" });
  await notifyCommunityUpdate({ recipientId: targetUserId, actorId: user.id, communitySlug: community.slug });

  revalidatePath(`/c/${community.slug}/manage`);
}

export async function declineJoinRequest(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const targetUserId = String(formData.get("userId") ?? "");
  if (!communityId || !targetUserId) return;
  if (!(await isCommunityStaff(communityId, user.id))) return;

  const pending = await requirePendingMember(communityId, targetUserId);
  if (!pending) return;

  const community = await db.communityMember
    .delete({ where: { communityId_userId: { communityId, userId: targetUserId } } })
    .then(() => db.community.findUnique({ where: { id: communityId }, select: { slug: true } }));

  if (community) revalidatePath(`/c/${community.slug}/manage`);
}

// phase-3 §4.1: owner-only — promotes a plain active member to moderator.
// Moderators can mute/ban plain members (isCommunityStaff) but never
// appoint/remove other moderators or the owner; that stays owner-exclusive
// to prevent moderator-on-moderator privilege escalation.
export async function appointModerator(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const targetUserId = String(formData.get("userId") ?? "");
  if (!communityId || !targetUserId) return;
  if (!(await isCommunityOwner(communityId, user.id))) return;

  const target = await getCommunityMember(communityId, targetUserId);
  if (!target || target.role !== "member" || target.status !== "active") return;

  await db.communityMember.update({
    where: { communityId_userId: { communityId, userId: targetUserId } },
    data: { role: "moderator" },
  });
  await logModAction({
    communityId,
    moderatorId: user.id,
    action: "appoint_moderator",
    targetType: "user",
    targetId: targetUserId,
  });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) {
    await notifyCommunityUpdate({ recipientId: targetUserId, actorId: user.id, communitySlug: community.slug });
    revalidatePath(`/c/${community.slug}/manage`);
  }
}

export async function removeModerator(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const targetUserId = String(formData.get("userId") ?? "");
  if (!communityId || !targetUserId) return;
  if (!(await isCommunityOwner(communityId, user.id))) return;

  const target = await getCommunityMember(communityId, targetUserId);
  if (!target || target.role !== "moderator") return;

  await db.communityMember.update({
    where: { communityId_userId: { communityId, userId: targetUserId } },
    data: { role: "member" },
  });
  await logModAction({
    communityId,
    moderatorId: user.id,
    action: "remove_moderator",
    targetType: "user",
    targetId: targetUserId,
  });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) revalidatePath(`/c/${community.slug}/manage`);
}

// Staff (owner or moderator) only, and only ever targets a plain member —
// never the owner, never another moderator. Demoting a problem moderator
// always goes through removeModerator (owner-only) first, never a mute/ban.
export async function muteMember(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const targetUserId = String(formData.get("userId") ?? "");
  if (!communityId || !targetUserId) return;
  if (!(await isCommunityStaff(communityId, user.id))) return;

  const target = await getCommunityMember(communityId, targetUserId);
  if (!target || target.role !== "member" || target.status !== "active") return;

  await db.communityMember.update({
    where: { communityId_userId: { communityId, userId: targetUserId } },
    data: { status: "muted" },
  });
  await logModAction({
    communityId,
    moderatorId: user.id,
    action: "mute_member",
    targetType: "user",
    targetId: targetUserId,
  });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) revalidatePath(`/c/${community.slug}/manage`);
}

export async function unmuteMember(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const targetUserId = String(formData.get("userId") ?? "");
  if (!communityId || !targetUserId) return;
  if (!(await isCommunityStaff(communityId, user.id))) return;

  const target = await getCommunityMember(communityId, targetUserId);
  if (!target || target.role !== "member" || target.status !== "muted") return;

  await db.communityMember.update({
    where: { communityId_userId: { communityId, userId: targetUserId } },
    data: { status: "active" },
  });
  await logModAction({
    communityId,
    moderatorId: user.id,
    action: "unmute_member",
    targetType: "user",
    targetId: targetUserId,
  });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) revalidatePath(`/c/${community.slug}/manage`);
}

// Bans flip status rather than delete — this is what makes a ban survive an
// attempted "leave" (leaveCommunity returns early for banned) and what
// blocks rejoining (joinCommunity's existing-row check above covers any
// status, banned included). A banned active/muted member no longer counts
// toward memberCount; a banned *pending* request never counted in the first
// place, so no decrement there.
export async function banMember(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const targetUserId = String(formData.get("userId") ?? "");
  if (!communityId || !targetUserId) return;
  if (!(await isCommunityStaff(communityId, user.id))) return;

  const target = await getCommunityMember(communityId, targetUserId);
  if (!target || target.role !== "member" || target.status === "banned") return;

  const wasCounted = target.status === "active" || target.status === "muted";

  await db.communityMember.update({
    where: { communityId_userId: { communityId, userId: targetUserId } },
    data: { status: "banned" },
  });
  if (wasCounted) {
    await db.community.update({ where: { id: communityId }, data: { memberCount: { decrement: 1 } } });
    await logMembershipEvent({ communityId, userId: targetUserId, type: "leave" });
  }
  await logModAction({
    communityId,
    moderatorId: user.id,
    action: "ban_member",
    targetType: "user",
    targetId: targetUserId,
  });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) {
    revalidatePath(`/c/${community.slug}/manage`);
    revalidatePath(`/c/${community.slug}`);
  }
}

// Unban deletes the row entirely rather than restoring "active" — a lifted
// ban means "back to being a stranger who can request to join again"
// (respecting the community's visibility gate), not silent reinstatement.
// No memberCount change: a banned row was already excluded from the count
// (decremented at ban time, or never counted if banned while pending).
export async function unbanMember(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const targetUserId = String(formData.get("userId") ?? "");
  if (!communityId || !targetUserId) return;
  if (!(await isCommunityStaff(communityId, user.id))) return;

  const target = await getCommunityMember(communityId, targetUserId);
  if (!target || target.status !== "banned") return;

  await db.communityMember.delete({ where: { communityId_userId: { communityId, userId: targetUserId } } });
  await logModAction({
    communityId,
    moderatorId: user.id,
    action: "unban_member",
    targetType: "user",
    targetId: targetUserId,
  });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) revalidatePath(`/c/${community.slug}/manage`);
}

// Owner-only. The outgoing owner becomes a moderator, not a plain member —
// they built the community; losing primary ownership shouldn't mean losing
// all standing in one action. Combined with leaveCommunity's owner-can't-
// leave guard and there being no "remove owner" code path at all, a
// community can never become ownerless by construction.
export async function transferOwnership(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const targetUserId = String(formData.get("userId") ?? "");
  if (!communityId || !targetUserId || targetUserId === user.id) return;
  if (!(await isCommunityOwner(communityId, user.id))) return;

  const target = await getCommunityMember(communityId, targetUserId);
  if (!target || target.status !== "active" || (target.role !== "member" && target.role !== "moderator")) return;

  await db.$transaction([
    db.communityMember.update({
      where: { communityId_userId: { communityId, userId: targetUserId } },
      data: { role: "owner" },
    }),
    db.communityMember.update({
      where: { communityId_userId: { communityId, userId: user.id } },
      data: { role: "moderator" },
    }),
  ]);
  await logModAction({
    communityId,
    moderatorId: user.id,
    action: "transfer_ownership",
    targetType: "user",
    targetId: targetUserId,
  });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) {
    revalidatePath(`/c/${community.slug}/manage`);
    revalidatePath(`/c/${community.slug}`);
  }
}

// Owner-only, hard delete. Cascades to every CommunityMember row via the
// existing onDelete: Cascade — nothing else references Community yet since
// no content layer (posts/wiki/chat) has been built.
export async function deleteCommunity(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  if (!communityId) return;
  if (!(await isCommunityOwner(communityId, user.id))) return;

  await db.community.delete({ where: { id: communityId } });

  redirect("/c");
}

// phase-3 spec §7.2: staff-only, scoped to a post that actually belongs to
// this community — a moderator of community A can't pin/remove a post in
// community B just by guessing its ID.
async function requireCommunityPost(communityId: string, postId: string) {
  return db.post.findFirst({ where: { id: postId, communityId, deletedAt: null } });
}

export async function pinPost(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const postId = String(formData.get("postId") ?? "");
  if (!communityId || !postId) return;
  if (!(await isCommunityStaff(communityId, user.id))) return;

  const post = await requireCommunityPost(communityId, postId);
  if (!post || post.pinnedAt !== null) return;

  await db.post.update({ where: { id: postId }, data: { pinnedAt: new Date() } });
  await logModAction({ communityId, moderatorId: user.id, action: "pin_post", targetType: "post", targetId: postId });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) revalidatePath(`/c/${community.slug}`);
}

// Not logged — reversing a pin is low-stakes and outside spec §13's action
// list; only the pin itself is the notable moderator action worth an
// audit-trail entry (deliberate, matching pinPost's ModAction write above).
export async function unpinPost(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const postId = String(formData.get("postId") ?? "");
  if (!communityId || !postId) return;
  if (!(await isCommunityStaff(communityId, user.id))) return;

  const post = await requireCommunityPost(communityId, postId);
  if (!post || post.pinnedAt === null) return;

  await db.post.update({ where: { id: postId }, data: { pinnedAt: null } });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) revalidatePath(`/c/${community.slug}`);
}

// Distinct from posts.ts's author-only deletePost — this is the staff
// "remove someone else's post" path, audited via ModAction, never callable
// by a non-staff member even against their own post (they already have
// deletePost for that).
export async function removeCommunityPost(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const postId = String(formData.get("postId") ?? "");
  if (!communityId || !postId) return;
  if (!(await isCommunityStaff(communityId, user.id))) return;

  const post = await requireCommunityPost(communityId, postId);
  if (!post) return;

  await softDeletePostAndDecrementCounts(post);
  await logModAction({ communityId, moderatorId: user.id, action: "remove_post", targetType: "post", targetId: postId });

  const community = await db.community.findUnique({ where: { id: communityId }, select: { slug: true } });
  if (community) revalidatePath(`/c/${community.slug}`);
}
