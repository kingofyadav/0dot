"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";

function revalidateBlockPaths(a: string | null, b: string | null) {
  revalidatePath("/feed");
  revalidatePath("/explore");
  for (const handle of [a, b]) {
    if (!handle) continue;
    revalidatePath(`/${handle}`);
    revalidatePath(`/${handle}/followers`);
    revalidatePath(`/${handle}/following`);
    // addendum §5: keeps the settings blocked-users list in sync with a
    // block/unblock made from the profile page's own button.
    revalidatePath(`/s/${handle}/blocked`);
  }
}

export async function blockUser(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const blockedId = String(formData.get("blockedId") ?? "");
  await blockUserById(user.id, blockedId);
}

// M12: extracted from blockUser's own body so /api/v1/blocks (a
// bearer-token caller, no cookie session to derive `user` from) can reuse
// the exact same transaction rather than a second copy of it — same
// "extract once a second caller needs the same logic under a different
// identity source" precedent as session-management.ts's own
// revokeAllOtherSessions split.
export async function blockUserById(blockerId: string, blockedId: string): Promise<void> {
  if (!blockedId || blockedId === blockerId) return;
  // Light, defense-in-depth limit — block/unblock mostly only affects the
  // actor's own view, unlike follow which is a real spam vector.
  if (!checkRateLimit(`block:user:${blockerId}`, { max: 20, windowMs: 5 * 60 * 1000 })) return;

  const existing = await db.block.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
  });
  if (existing) return; // idempotent

  const [blocker, blocked] = await Promise.all([
    db.user.findUnique({ where: { id: blockerId }, include: { username: true } }),
    db.user.findUnique({ where: { id: blockedId }, include: { username: true, profile: true } }),
  ]);
  if (!blocked) return;

  // Removes any existing follow between the two accounts, in either
  // direction, with matching denormalized-count fixups — phase-2 spec
  // §5.6: "existing follow, if any, is removed on block."
  const existingFollows = await db.follow.findMany({
    where: {
      OR: [
        { followerId: blockerId, followeeId: blockedId },
        { followerId: blockedId, followeeId: blockerId },
      ],
    },
  });

  // phase-2 spec §5.6: hidden from the *blocker's* inbox, not deleted —
  // only the blocker's own ConversationParticipant row is touched, and only
  // for direct conversations (blocking's messaging effects aren't defined
  // for an existing group chat, so this doesn't invent any). sendMessage/
  // startDirectConversation (src/app/actions/messages.ts) separately check
  // isBlockedEitherWay to stop new messages outright.
  const sharedDirectConversation = await db.conversation.findFirst({
    where: {
      kind: "direct",
      AND: [
        { participants: { some: { userId: blockerId } } },
        { participants: { some: { userId: blockedId } } },
      ],
    },
    select: { id: true },
  });

  await db.$transaction([
    db.block.create({ data: { blockerId, blockedId } }),
    ...existingFollows.flatMap((follow) => [
      db.follow.delete({
        where: { followerId_followeeId: { followerId: follow.followerId, followeeId: follow.followeeId } },
      }),
      db.profile.update({ where: { userId: follow.followerId }, data: { followingCount: { decrement: 1 } } }),
      db.profile.update({ where: { userId: follow.followeeId }, data: { followerCount: { decrement: 1 } } }),
    ]),
    ...(sharedDirectConversation
      ? [
          db.conversationParticipant.update({
            where: { conversationId_userId: { conversationId: sharedDirectConversation.id, userId: blockerId } },
            data: { hiddenAt: new Date() },
          }),
        ]
      : []),
  ]);

  revalidateBlockPaths(blocker?.username?.handle ?? null, blocked.username?.handle ?? null);
  if (sharedDirectConversation) revalidatePath("/messages");
}

export async function unblockUser(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const blockedId = String(formData.get("blockedId") ?? "");
  await unblockUserById(user.id, blockedId);
}

// M12: same extraction reasoning as blockUserById above — /api/v1/blocks/[id]
// (bearer-token caller) reuses this instead of a second copy.
export async function unblockUserById(blockerId: string, blockedId: string): Promise<void> {
  if (!blockedId) return;

  const existing = await db.block.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
  });
  if (!existing) return;

  const [blocker, blocked] = await Promise.all([
    db.user.findUnique({ where: { id: blockerId }, include: { username: true } }),
    db.user.findUnique({ where: { id: blockedId }, include: { username: true } }),
  ]);

  // Restoring conversation visibility on unblock (unlike the follow
  // relationship below, which is a deliberate one-way effect — "follow
  // again" is an active, visible choice the user can just make). A hidden
  // conversation has no other affordance to ever resurface it, and spec
  // §5.6 says "hidden... not deleted," which reads as reversible — so
  // leaving it hidden forever after a legitimate unblock would be a silent
  // dead end, not a real product decision.
  const sharedDirectConversation = await db.conversation.findFirst({
    where: {
      kind: "direct",
      AND: [
        { participants: { some: { userId: blockerId } } },
        { participants: { some: { userId: blockedId } } },
      ],
    },
    select: { id: true },
  });

  // Deletes the Block row only — does not restore any follow relationship
  // that was removed when the block was created. That removal was a
  // one-way effect, not a pause.
  await db.$transaction([
    db.block.delete({ where: { blockerId_blockedId: { blockerId, blockedId } } }),
    ...(sharedDirectConversation
      ? [
          db.conversationParticipant.update({
            where: { conversationId_userId: { conversationId: sharedDirectConversation.id, userId: blockerId } },
            data: { hiddenAt: null },
          }),
        ]
      : []),
  ]);

  revalidateBlockPaths(blocker?.username?.handle ?? null, blocked?.username?.handle ?? null);
  if (sharedDirectConversation) revalidatePath("/messages");
}
