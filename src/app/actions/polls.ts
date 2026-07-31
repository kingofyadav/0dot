"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { resolvePostCommunityContext } from "@/lib/communities";
import { notifyMentionsInBody } from "@/lib/notifications";
import type { ActionState } from "@/app/actions/auth";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

// Duration presets rather than a raw datetime input — simpler UX, and
// avoids timezone-handling edge cases a free-text datetime field invites.
const DURATION_MINUTES: Record<string, number> = {
  "60": 60,
  "1440": 60 * 24,
  "4320": 60 * 24 * 3,
  "10080": 60 * 24 * 7,
};

// Same bucket as posts.ts's checkPostRateLimit — a poll creates a Post row
// too, so it shares createPost's budget rather than getting its own (see
// that function's comment for why this key is duplicated here instead of
// imported).
function checkPostRateLimit(userId: string): boolean {
  return checkRateLimit(`post:create:user:${userId}`, { max: 10, windowMs: 5 * 60 * 1000 });
}

// phase-3 spec §8: a poll compose flow is structurally different enough
// from a text/media post (option inputs, no attachments, always top-level)
// to get its own action rather than another branch on the already
// multi-shaped createPost (src/app/actions/posts.ts).
export async function createPollPost(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireVerifiedUser();

  if (!checkPostRateLimit(user.id)) {
    return { error: "You're posting too fast. Please slow down." };
  }

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 1) return { error: "Add a question for your poll." };
  if (body.length > 500) return { error: "Posts are limited to 500 characters." };

  const options = formData
    .getAll("option")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0)
    .slice(0, MAX_OPTIONS);
  if (options.length < MIN_OPTIONS) return { error: `A poll needs at least ${MIN_OPTIONS} options.` };
  if (options.some((o) => o.length > 80)) return { error: "Poll options are limited to 80 characters." };

  const durationRaw = String(formData.get("durationMinutes") ?? "");
  const durationMinutes = DURATION_MINUTES[durationRaw];
  if (!durationMinutes) return { error: "Invalid poll duration." };
  const closesAt = new Date(Date.now() + durationMinutes * 60 * 1000);

  const allowsMultipleChoice = formData.get("allowsMultipleChoice") === "on";

  const communityContext = await resolvePostCommunityContext(
    user.id,
    String(formData.get("communityId") ?? "").trim() || null,
    String(formData.get("flairId") ?? "").trim() || null
  );
  if (communityContext && "error" in communityContext) return { error: communityContext.error };

  const newPost = await db.post.create({
    data: {
      authorId: user.id,
      body,
      communityId: communityContext?.communityId ?? null,
      flairId: communityContext?.flairId ?? null,
      poll: {
        create: {
          closesAt,
          allowsMultipleChoice,
          options: { create: options.map((label, position) => ({ label, position })) },
        },
      },
    },
  });

  await notifyMentionsInBody(body, user.id, newPost.id);

  revalidatePath("/feed");
  revalidatePath("/explore");
  if (communityContext) revalidatePath(`/c/${communityContext.communitySlug}`);
  if (user.username) revalidatePath(`/${user.username.handle}`);
  return undefined;
}

// spec §8.2: votes after closesAt are rejected, not silently accepted —
// "rejected" here means the write never happens, surfaced to the voter as
// the vote button being disabled once closed (PostCard's PollBlock) rather
// than a returned error string. Plain <form action> (like toggleLike/
// toggleRepost in posts.ts), not useActionState, so this returns void and
// relies on revalidatePath, same posture as those toggles' silent no-op on
// invalid input. Single-choice removes any prior vote on the poll's
// *other* options before inserting the new one; multi-choice is a
// per-option toggle (voting an already-voted option removes it, others
// unaffected) — the spec doesn't pin down multi-choice toggle semantics
// explicitly, this is the natural reading.
export async function castVote(formData: FormData): Promise<void> {
  const user = await requireVerifiedUser();
  const pollOptionId = String(formData.get("pollOptionId") ?? "");
  if (!pollOptionId) return;

  const option = await db.pollOption.findUnique({
    where: { id: pollOptionId },
    include: { poll: { select: { id: true, closesAt: true, allowsMultipleChoice: true, postId: true } } },
  });
  if (!option) return;
  if (option.poll.closesAt.getTime() <= Date.now()) return;

  if (option.poll.allowsMultipleChoice) {
    const existing = await db.pollVote.findUnique({
      where: { pollOptionId_userId: { pollOptionId, userId: user.id } },
    });
    if (existing) {
      await db.pollVote.delete({ where: { pollOptionId_userId: { pollOptionId, userId: user.id } } });
    } else {
      await db.pollVote.create({ data: { pollOptionId, userId: user.id } });
    }
  } else {
    const siblingOptions = await db.pollOption.findMany({
      where: { pollId: option.poll.id },
      select: { id: true },
    });
    await db.$transaction([
      db.pollVote.deleteMany({
        where: { userId: user.id, pollOptionId: { in: siblingOptions.map((o) => o.id) } },
      }),
      db.pollVote.create({ data: { pollOptionId, userId: user.id } }),
    ]);
  }

  revalidatePath("/feed");
  revalidatePath("/explore");
  return undefined;
}
