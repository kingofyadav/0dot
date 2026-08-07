import "server-only";
import { db } from "@/lib/db";
import { decryptAtRest } from "@/lib/message-crypto";
import { getSocialPublishProvider } from "@/lib/social-publish-provider";
import { isCrossPostPlatform } from "@/lib/cross-post-platforms";

const RETRY_BACKOFF_MS = 5 * 60 * 1000; // same backoff constant as webhooks.ts's deliverWebhook
const MAX_ATTEMPTS = 5; // lower than WebhookDelivery's FAILURE_THRESHOLD (10) — a per-post give-up, not an integration disable

type DuePost = { id: string; content: string; mediaUrlsJson: string };
type DueTarget = {
  id: string;
  attemptCount: number;
  externalAccount: { platform: string; accessTokenEnc: string; status: string };
};

async function attemptTarget(target: DueTarget, post: DuePost): Promise<void> {
  await db.crossPostTarget.update({
    where: { id: target.id },
    data: { status: "publishing", lastAttemptedAt: new Date() },
  });

  const platform = target.externalAccount.platform;
  if (!isCrossPostPlatform(platform)) {
    // Not a publish-target platform (shouldn't happen — createScheduledCrossPost
    // only offers cross-post-capable accounts) — terminal failure, no retry.
    await db.crossPostTarget.update({
      where: { id: target.id },
      data: { status: "failed", errorMessage: `Unsupported platform: ${platform}`, nextRetryAt: null },
    });
    return;
  }
  if (target.externalAccount.status !== "connected") {
    // The account was disconnected after this post was scheduled — terminal
    // failure, no retry (see disconnectExternalAccount's revoke-not-delete).
    await db.crossPostTarget.update({
      where: { id: target.id },
      data: { status: "failed", errorMessage: "Account disconnected", nextRetryAt: null },
    });
    return;
  }

  try {
    const accessToken = decryptAtRest(target.externalAccount.accessTokenEnc);
    const mediaUrls: string[] = JSON.parse(post.mediaUrlsJson);
    const result = await getSocialPublishProvider(platform).publish({
      accessToken,
      content: post.content,
      mediaUrls,
    });
    await db.crossPostTarget.update({
      where: { id: target.id },
      data: {
        status: "published",
        externalPostId: result.externalPostId,
        externalPostUrl: result.externalPostUrl,
        errorMessage: null,
        nextRetryAt: null,
      },
    });
  } catch (err) {
    const attemptCount = target.attemptCount + 1;
    const exhausted = attemptCount >= MAX_ATTEMPTS;
    await db.crossPostTarget.update({
      where: { id: target.id },
      data: {
        status: "failed",
        attemptCount,
        errorMessage: err instanceof Error ? err.message : "Publish failed",
        nextRetryAt: exhausted ? null : new Date(Date.now() + RETRY_BACKOFF_MS),
      },
    });
  }
}

// A target is terminal once it's published, or failed with no nextRetryAt
// left (attempts exhausted) — anything else (pending/publishing, or failed
// with a future nextRetryAt) still has work left before the parent post
// can be rolled up.
function isTerminal(target: { status: string; nextRetryAt: Date | null }): boolean {
  return target.status === "published" || (target.status === "failed" && target.nextRetryAt === null);
}

async function rollUpIfDone(scheduledPostId: string): Promise<void> {
  const targets = await db.crossPostTarget.findMany({ where: { scheduledPostId } });
  if (!targets.every(isTerminal)) return;

  const status = targets.every((t) => t.status === "published")
    ? "completed"
    : targets.every((t) => t.status === "failed")
      ? "failed"
      : "partially_failed";
  await db.scheduledCrossPost.update({ where: { id: scheduledPostId }, data: { status } });
}

// Real work: publish every ScheduledCrossPost whose scheduledFor has
// arrived, plus retry any CrossPostTarget whose backoff window elapsed.
// Exported directly (not just through the scheduler below) so it can be
// called from a test or a manual "publish now" trigger without waiting on
// the interval.
export async function publishDueCrossPosts(now: Date = new Date()): Promise<void> {
  const duePosts = await db.scheduledCrossPost.findMany({
    where: { status: "scheduled", scheduledFor: { lte: now } },
    include: { targets: { include: { externalAccount: true } } },
    take: 200, // per-run cap, same write-volume safety valve as portfolio-sync.ts/social-content-sync.ts
  });

  for (const post of duePosts) {
    await db.scheduledCrossPost.update({ where: { id: post.id }, data: { status: "publishing" } });
    for (const target of post.targets) {
      await attemptTarget(target, post);
    }
    await rollUpIfDone(post.id);
  }

  // Covers both normal retry-after-backoff (failed, nextRetryAt elapsed) and
  // recovery from an interrupted run (pending/publishing targets left behind
  // by a crash mid-publishDueCrossPosts — the re-entry guard in
  // ensureCrossPostsPublished means a "publishing" target found at the start
  // of a new tick can only be leftover from a prior run, never a concurrent
  // one).
  const retryTargets = await db.crossPostTarget.findMany({
    where: {
      scheduledPost: { status: "publishing" },
      OR: [{ status: { in: ["pending", "publishing"] } }, { status: "failed", nextRetryAt: { lte: now } }],
    },
    include: { externalAccount: true, scheduledPost: true },
    take: 200,
  });
  for (const target of retryTargets) {
    await attemptTarget(target, target.scheduledPost);
    await rollUpIfDone(target.scheduledPostId);
  }
}

// Same "module-scope setInterval, globalThis re-entry guard" posture as
// trending.ts/portfolio-sync.ts — this app is a single long-lived `next
// start` process, not serverless, so a plain interval is the right-sized
// tool. lastPolledAt/polling give the same "N callers share one in-flight
// run" behavior trending.ts's ensureTrendingScoresFresh has.
const POLL_INTERVAL_MS = 60 * 1000;
let lastPolledAt = 0;
let polling: Promise<void> | null = null;

export async function ensureCrossPostsPublished(): Promise<void> {
  const now = Date.now();
  if (now - lastPolledAt < POLL_INTERVAL_MS) return;
  if (polling) {
    await polling;
    return;
  }
  lastPolledAt = now;
  polling = publishDueCrossPosts(new Date(now)).finally(() => {
    polling = null;
  });
  await polling;
}

const globalForCrossPost = globalThis as unknown as { crossPostSchedulerStarted?: boolean };

export function startSocialPublishScheduler(): void {
  if (globalForCrossPost.crossPostSchedulerStarted) return;
  globalForCrossPost.crossPostSchedulerStarted = true;

  const tick = () => void ensureCrossPostsPublished();
  tick();
  setInterval(tick, POLL_INTERVAL_MS);
}
