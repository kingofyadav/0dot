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
  }
}

export async function blockUser(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const blockedId = String(formData.get("blockedId") ?? "");

  if (!blockedId || blockedId === user.id) return;
  // Light, defense-in-depth limit — block/unblock mostly only affects the
  // actor's own view, unlike follow which is a real spam vector.
  if (!checkRateLimit(`block:user:${user.id}`, { max: 20, windowMs: 5 * 60 * 1000 })) return;

  const existing = await db.block.findUnique({
    where: { blockerId_blockedId: { blockerId: user.id, blockedId } },
  });
  if (existing) return; // idempotent

  const blocked = await db.user.findUnique({
    where: { id: blockedId },
    include: { username: true, profile: true },
  });
  if (!blocked) return;

  // Removes any existing follow between the two accounts, in either
  // direction, with matching denormalized-count fixups — phase-2 spec
  // §5.6: "existing follow, if any, is removed on block."
  const existingFollows = await db.follow.findMany({
    where: {
      OR: [
        { followerId: user.id, followeeId: blockedId },
        { followerId: blockedId, followeeId: user.id },
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
        { participants: { some: { userId: user.id } } },
        { participants: { some: { userId: blockedId } } },
      ],
    },
    select: { id: true },
  });

  await db.$transaction([
    db.block.create({ data: { blockerId: user.id, blockedId } }),
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
            where: { conversationId_userId: { conversationId: sharedDirectConversation.id, userId: user.id } },
            data: { hiddenAt: new Date() },
          }),
        ]
      : []),
  ]);

  revalidateBlockPaths(user.username?.handle ?? null, blocked.username?.handle ?? null);
  if (sharedDirectConversation) revalidatePath("/messages");
}

export async function unblockUser(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const blockedId = String(formData.get("blockedId") ?? "");

  if (!blockedId) return;

  const existing = await db.block.findUnique({
    where: { blockerId_blockedId: { blockerId: user.id, blockedId } },
  });
  if (!existing) return;

  const blocked = await db.user.findUnique({ where: { id: blockedId }, include: { username: true } });

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
        { participants: { some: { userId: user.id } } },
        { participants: { some: { userId: blockedId } } },
      ],
    },
    select: { id: true },
  });

  // Deletes the Block row only — does not restore any follow relationship
  // that was removed when the block was created. That removal was a
  // one-way effect, not a pause.
  await db.$transaction([
    db.block.delete({ where: { blockerId_blockedId: { blockerId: user.id, blockedId } } }),
    ...(sharedDirectConversation
      ? [
          db.conversationParticipant.update({
            where: { conversationId_userId: { conversationId: sharedDirectConversation.id, userId: user.id } },
            data: { hiddenAt: null },
          }),
        ]
      : []),
  ]);

  revalidateBlockPaths(user.username?.handle ?? null, blocked?.username?.handle ?? null);
  if (sharedDirectConversation) revalidatePath("/messages");
}
