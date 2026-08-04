"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { getCommunityMember, isCommunityStaff, logModAction } from "@/lib/communities";
import type { ActionState } from "@/app/actions/auth";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

// spec §10.1: "moderators only" (default) or "any member," configurable
// per community — a much lower-collision-risk namespace than community/
// username slugs (lives under /c/slug/wiki/, no top-level routing
// conflict), so this gets a simple format check rather than reusing
// reserved-community-slugs.ts's reserved-word list.
async function canEditWiki(community: { id: string; wikiEditPolicy: string }, userId: string): Promise<boolean> {
  if (community.wikiEditPolicy === "members") {
    const member = await getCommunityMember(community.id, userId);
    return member?.status === "active";
  }
  return isCommunityStaff(community.id, userId);
}

export async function createWikiPage(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const communityId = String(formData.get("communityId") ?? "");
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!SLUG_PATTERN.test(slug)) {
    return { error: "Slug must be lowercase letters, numbers, and hyphens." };
  }
  if (title.length < 1 || title.length > 120) return { error: "Title must be 1-120 characters." };
  if (body.length < 1) return { error: "Page content can't be empty." };

  const community = await db.community.findUnique({
    where: { id: communityId },
    select: { id: true, slug: true, wikiEditPolicy: true },
  });
  if (!community) return { error: "Community not found." };
  if (!(await canEditWiki(community, user.id))) return { error: "You don't have permission to add wiki pages." };

  const existing = await db.wikiPage.findUnique({ where: { communityId_slug: { communityId, slug } } });
  if (existing) return { error: "A page with that slug already exists." };

  // Nested create gets Page + first Revision in one call; currentRevisionId
  // is briefly null on the row Prisma returns from `create`, then set here
  // — never observable as null to a reader, since nothing else can see this
  // row between the two calls (see the WikiPage schema comment).
  const page = await db.wikiPage.create({
    data: {
      communityId,
      slug,
      title,
      revisions: { create: [{ body, editedBy: user.id }] },
    },
    include: { revisions: true },
  });
  await db.wikiPage.update({
    where: { id: page.id },
    data: { currentRevisionId: page.revisions[0].id },
  });

  if (await isCommunityStaff(community.id, user.id)) {
    await logModAction({
      communityId: community.id,
      moderatorId: user.id,
      action: "edit_wiki",
      targetType: "wiki_page",
      targetId: page.id,
      reason: "created",
    });
  }

  revalidatePath(`/c/${community.slug}/wiki`);
  redirect(`/c/${community.slug}/wiki/${slug}`);
}

// spec §10.2: always appends a new WikiRevision, never overwrites in
// place. ModAction (edit_wiki) is logged only when the editor holds staff
// role — a plain member's edit under an open "members" policy isn't a
// moderator action and shouldn't spam the modlog (same "only notable
// actions get logged" reasoning unpinPost already established).
//
// Note: spec §15 also lists wiki edits as a community_update source, but
// (like rule edits — see community-rules.ts's comment) that's a per-
// recipient notification and this codebase has no fan-out-to-every-member
// write pattern yet. Deliberately not wired here for the same reason.
export async function editWikiPage(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const wikiPageId = String(formData.get("wikiPageId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 1) return { error: "Page content can't be empty." };

  const page = await db.wikiPage.findUnique({
    where: { id: wikiPageId },
    include: { community: { select: { id: true, slug: true, wikiEditPolicy: true } } },
  });
  // This action is community-wiki-only (phase-7 spec §5.1's ownership XOR:
  // profile/book-owned pages go through their own dedicated actions, same
  // "small dedicated action functions per owner type" split articles.ts vs.
  // wiki.ts already established) — a null community here means the id
  // resolved to a profile/book-owned page, which this action was never
  // meant to touch.
  if (!page || !page.community) return { error: "Page not found." };
  if (!(await canEditWiki(page.community, user.id))) {
    return { error: "You don't have permission to edit this page." };
  }

  const revision = await db.wikiRevision.create({ data: { wikiPageId: page.id, body, editedBy: user.id } });
  await db.wikiPage.update({ where: { id: page.id }, data: { currentRevisionId: revision.id } });

  if (await isCommunityStaff(page.community.id, user.id)) {
    await logModAction({
      communityId: page.community.id,
      moderatorId: user.id,
      action: "edit_wiki",
      targetType: "wiki_page",
      targetId: page.id,
    });
  }

  revalidatePath(`/c/${page.community.slug}/wiki/${page.slug}`);
  redirect(`/c/${page.community.slug}/wiki/${page.slug}`);
}
