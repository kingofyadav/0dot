import "server-only";
import { db } from "@/lib/db";
import { getAIProvider } from "@/lib/ai-provider";
import { logAIGeneration } from "@/lib/ai-generation";
import { notifyModerationAction } from "@/lib/notifications";
import { softDeletePostAndDecrementCounts } from "@/lib/post-moderation";

// phase-11 spec §4.2: content matching known CSAM hash-matching databases
// (PhotoDNA/NCMEC) is categorically NOT handled by this file. It triggers a
// mandatory, time-sensitive legal reporting obligation in most
// jurisdictions, not a discretionary moderation judgment with a tunable
// confidence threshold, and must never be modeled as a risk_category value
// indistinguishable from "spam" alongside a human-review queue. That
// pipeline needs its own dedicated, legally-reviewed implementation
// (auto-action, mandatory reporting, no standard user notification) and is
// explicitly out of scope here — this file only ever produces
// pending_human_review rows for ordinary categories that end at a human
// decision.

const MODERATION_SUBJECT_OWNER: Record<string, (id: string) => Promise<string | null>> = {
  post: async (id) => (await db.post.findUnique({ where: { id }, select: { authorId: true } }))?.authorId ?? null,
  article: async (id) => (await db.article.findUnique({ where: { id }, select: { authorId: true } }))?.authorId ?? null,
  comment: async (id) => (await db.comment.findUnique({ where: { id }, select: { authorId: true } }))?.authorId ?? null,
};

// The single write path for a moderation classification — every call logs
// an AIGeneration regardless of outcome (§3.3), and only creates a
// ModerationFlag when the classifier actually suggests action, same
// "flag_for_review is not manufactured for a zero-risk item" posture any
// real classifier would need.
export async function classifyAndFlag(params: { subjectType: string; subjectId: string; text: string }): Promise<void> {
  const provider = getAIProvider();
  const classification = await provider.classifyModeration(params.text);

  const generation = await logAIGeneration({
    feature: "moderation",
    requestedById: null, // system-initiated (§3: "null for system-initiated generations")
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    modelName: provider.modelName,
    input: { textLength: params.text.length },
    output: classification,
    costTokens: classification.costTokens,
  });

  if (classification.suggestedAction === "none") return;

  await db.moderationFlag.create({
    data: {
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      aiGenerationId: generation.id,
      riskCategory: classification.riskCategory,
      confidence: classification.confidence,
      suggestedAction: classification.suggestedAction,
    },
  });

  // phase-12 spec §11 step 3: wires ModerationFlag into the unified queue —
  // ModerationFlag.status stays the source of truth (§3.3); resolving the
  // case (trust-safety.ts) looks the flag back up via linkedAiGenerationId
  // and calls this same file's reviewModerationFlag. Dynamic import avoids
  // a load-time cycle (trust-safety.ts imports reviewModerationFlag from
  // this module).
  const { createTrustSafetyCase } = await import("@/lib/trust-safety");
  await createTrustSafetyCase({
    caseType: "ai_moderation_flag",
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    linkedAiGenerationId: generation.id,
  });
}

// §4.1/§4.3: the only place any flagged item is actually actioned, and only
// after a human reviewedBy decision — no suggestedAction value here ever
// removes content by itself.
export async function reviewModerationFlag(
  flagId: string,
  reviewerId: string,
  decision: "upheld" | "overridden"
): Promise<void> {
  const flag = await db.moderationFlag.update({
    where: { id: flagId },
    data: { status: decision, reviewedById: reviewerId, reviewedAt: new Date() },
  });

  if (decision !== "upheld") return;

  if (flag.subjectType === "post") {
    const post = await db.post.findUnique({
      where: { id: flag.subjectId },
      select: { id: true, replyToId: true, repostOfId: true, deletedAt: true },
    });
    if (post && !post.deletedAt) await softDeletePostAndDecrementCounts(post);
  } else if (flag.subjectType === "comment") {
    await db.comment.updateMany({ where: { id: flag.subjectId, deletedAt: null }, data: { deletedAt: new Date() } });
  } else if (flag.subjectType === "article") {
    // No standalone "removed" status exists on Article yet — reverting to
    // draft is the closest existing lever, same posture as the review-gate
    // acceptance criteria elsewhere in this schema that reuse an existing
    // status field rather than inventing a parallel one.
    await db.article.updateMany({ where: { id: flag.subjectId }, data: { status: "draft" } });
  }

  const ownerLookup = MODERATION_SUBJECT_OWNER[flag.subjectType];
  const ownerId = ownerLookup ? await ownerLookup(flag.subjectId) : null;
  // §4.3 acceptance criterion: standard notification on upheld outcomes for
  // ordinary categories, giving the affected user visibility.
  if (ownerId) await notifyModerationAction({ recipientId: ownerId, subjectType: flag.subjectType, subjectId: flag.subjectId });
}

async function getClassifiedSubjectIds(subjectType: string): Promise<string[]> {
  const rows = await db.aIGeneration.findMany({
    where: { feature: "moderation", subjectType },
    select: { subjectId: true },
  });
  return rows.map((r) => r.subjectId).filter((id): id is string => id !== null);
}

// spec §4.1's "system-initiated generations (e.g. async moderation
// classification of new content)" — never computed synchronously on the
// create path, same async-job posture as ai-accessibility.ts. Per-run
// take:50 cap per subject type, same safety-valve reasoning as
// trending.ts's CANDIDATE_LIMIT.
async function processPendingModerationJobs(): Promise<void> {
  const [classifiedPostIds, classifiedArticleIds, classifiedCommentIds] = await Promise.all([
    getClassifiedSubjectIds("post"),
    getClassifiedSubjectIds("article"),
    getClassifiedSubjectIds("comment"),
  ]);

  const [posts, articles, comments] = await Promise.all([
    db.post.findMany({
      where: { deletedAt: null, id: { notIn: classifiedPostIds } },
      select: { id: true, body: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.article.findMany({
      where: { id: { notIn: classifiedArticleIds } },
      select: { id: true, title: true, body: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.comment.findMany({
      where: { deletedAt: null, id: { notIn: classifiedCommentIds } },
      select: { id: true, body: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  for (const post of posts) await classifyAndFlag({ subjectType: "post", subjectId: post.id, text: post.body });
  for (const article of articles) {
    await classifyAndFlag({ subjectType: "article", subjectId: article.id, text: `${article.title}\n${article.body}` });
  }
  for (const comment of comments) await classifyAndFlag({ subjectType: "comment", subjectId: comment.id, text: comment.body });
}

const MODERATION_JOB_INTERVAL_MS = 60 * 1000;
const globalForModeration = globalThis as unknown as { moderationSchedulerStarted?: boolean };
let runningModeration: Promise<void> | null = null;

function triggerModerationRun(): void {
  if (runningModeration) return;
  runningModeration = processPendingModerationJobs().finally(() => {
    runningModeration = null;
  });
}

// Registered from instrumentation.ts, same shape as the other schedulers.
export function startModerationScheduler(): void {
  if (globalForModeration.moderationSchedulerStarted) return;
  globalForModeration.moderationSchedulerStarted = true;

  triggerModerationRun();
  setInterval(triggerModerationRun, MODERATION_JOB_INTERVAL_MS);
}
