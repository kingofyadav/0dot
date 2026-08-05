import "server-only";
import { db } from "@/lib/db";

// phase-11 spec §3: the one shared substrate every AI feature in this phase
// logs through — see prisma/schema.prisma's AIGeneration model comment for
// why this is generalized from the first feature rather than this series'
// usual "wait for three instances" discipline.
export type AIFeature =
  | "profile_builder"
  | "content_writer"
  | "moderation"
  | "recommendation"
  | "search_rerank"
  | "translation"
  | "accessibility_caption";

// §3.2: a private-subject row gets a bounded/redacted summary, not a
// verbatim prompt — this cap is that boundedness, applied uniformly rather
// than trusting each of the seven call sites to remember to truncate.
const PRIVATE_SUMMARY_CHARS = 280;
const PUBLIC_SUMMARY_CHARS = 4000;

// §3.3: private-subject rows get a bounded retention window, not indefinite
// storage.
const PRIVATE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function summarize(value: unknown, isPrivate: boolean): string {
  const json = JSON.stringify(value ?? null) ?? "null";
  const limit = isPrivate ? PRIVATE_SUMMARY_CHARS : PUBLIC_SUMMARY_CHARS;
  return json.length > limit ? `${json.slice(0, limit)}…` : json;
}

// Subject types whose visibility can be "private" per that model's own
// field (§3.2/§10.2: inherits the subject's sensitivity, checked against
// the subject's own field — not a second, driftable copy of it). Post and
// Community aren't included: Post has no private tier of its own (tier
// gating, not a visibility enum) and no AI feature in this phase produces
// generations scoped to a Community subject.
const PRIVATE_VISIBILITY_LOOKUP: Record<string, (id: string) => Promise<string | null>> = {
  article: async (id) => (await db.article.findUnique({ where: { id }, select: { visibility: true } }))?.visibility ?? null,
  project: async (id) => (await db.project.findUnique({ where: { id }, select: { visibility: true } }))?.visibility ?? null,
  published_file: async (id) => (await db.publishedFile.findUnique({ where: { id }, select: { visibility: true } }))?.visibility ?? null,
  wiki_page: async (id) => (await db.wikiPage.findUnique({ where: { id }, select: { visibility: true } }))?.visibility ?? null,
  book: async (id) => (await db.book.findUnique({ where: { id }, select: { visibility: true } }))?.visibility ?? null,
};

// Called by feature code (ai-content.ts, ai-translation.ts, etc.) before
// logging, since only the caller knows which subject type/field applies.
// Kept here rather than duplicated per-feature so "what counts as private"
// stays a single answer.
export async function isSubjectPrivate(subjectType: string | null, subjectId: string | null): Promise<boolean> {
  if (!subjectType || !subjectId) return false;
  const lookup = PRIVATE_VISIBILITY_LOOKUP[subjectType];
  if (!lookup) return false;
  const visibility = await lookup(subjectId);
  return visibility === "private";
}

type LogAIGenerationInput = {
  feature: AIFeature;
  requestedById?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  isPrivate?: boolean;
  modelName: string;
  input: unknown;
  output: unknown;
  costTokens?: number | null;
};

// The one write path every AI feature invocation goes through (§3.3
// acceptance criterion: no feature ships with a separate, bespoke logging
// mechanism).
export async function logAIGeneration(params: LogAIGenerationInput) {
  const isPrivate = params.isPrivate ?? (await isSubjectPrivate(params.subjectType ?? null, params.subjectId ?? null));
  return db.aIGeneration.create({
    data: {
      feature: params.feature,
      requestedById: params.requestedById ?? null,
      subjectType: params.subjectType ?? null,
      subjectId: params.subjectId ?? null,
      modelName: params.modelName,
      inputSummary: summarize(params.input, isPrivate),
      outputSummary: summarize(params.output, isPrivate),
      costTokens: params.costTokens ?? null,
    },
  });
}

// §5.1/§5.3: distinct from "was it generated" — set once a human actually
// uses/accepts (or explicitly discards) a suggestion.
export async function markAIGenerationAccepted(id: string, accepted: boolean): Promise<void> {
  await db.aIGeneration.update({ where: { id }, data: { accepted } });
}

// §3.3 acceptance criterion: sweeps AIGeneration rows past the private
// retention window whose subject is (still) private. Same periodic-sweep
// shape as trending.ts/portfolio-sync.ts's schedulers rather than a
// per-row TTL, since SQLite has no native expiry mechanism.
export async function pruneExpiredPrivateAIGenerations(): Promise<number> {
  const cutoff = new Date(Date.now() - PRIVATE_RETENTION_MS);
  const candidates = await db.aIGeneration.findMany({
    where: { createdAt: { lt: cutoff }, subjectType: { not: null }, subjectId: { not: null } },
    select: { id: true, subjectType: true, subjectId: true },
    take: 500, // per-run cap, same safety-valve reasoning as trending.ts's CANDIDATE_LIMIT
  });

  const staleIds: string[] = [];
  for (const row of candidates) {
    if (await isSubjectPrivate(row.subjectType, row.subjectId)) staleIds.push(row.id);
  }
  if (staleIds.length === 0) return 0;
  const { count } = await db.aIGeneration.deleteMany({ where: { id: { in: staleIds } } });
  return count;
}
