import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getAIProvider } from "@/lib/ai-provider";
import { logAIGeneration } from "@/lib/ai-generation";

// phase-11 spec §9: on-demand, cached per exact source version.
// Deliberately takes sourceText/sourceRevisionKey from the caller rather
// than re-fetching the subject itself — the caller (an article/wiki page
// that already loaded the row through its own visibility-gated query) is
// the one authorization check a translation goes through; this file adds
// no second one that could drift from it (§9.2 acceptance criterion).
export async function getOrCreateTranslation(params: {
  subjectType: string;
  subjectId: string;
  sourceRevisionKey: string;
  targetLanguage: string;
  sourceText: string;
  requestedById?: string | null;
}): Promise<{ translatedText: string; cached: boolean }> {
  const existing = await db.contentTranslation.findUnique({
    where: {
      subjectType_subjectId_sourceRevisionKey_targetLanguage: {
        subjectType: params.subjectType,
        subjectId: params.subjectId,
        sourceRevisionKey: params.sourceRevisionKey,
        targetLanguage: params.targetLanguage,
      },
    },
  });
  // Keying on the *current* sourceRevisionKey means a stale translation
  // cached under a prior revision's key is structurally never looked up
  // again the moment the source is edited — satisfies §9.2 without a
  // separate invalidation step that could be forgotten on an edit path.
  if (existing) return { translatedText: existing.translatedText, cached: true };

  const provider = getAIProvider();
  const result = await provider.translate({ text: params.sourceText, targetLanguage: params.targetLanguage });

  const generation = await logAIGeneration({
    feature: "translation",
    requestedById: params.requestedById ?? null,
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    modelName: provider.modelName,
    input: { targetLanguage: params.targetLanguage, sourceRevisionKey: params.sourceRevisionKey },
    output: { text: result.text },
    costTokens: result.costTokens,
  });

  try {
    const row = await db.contentTranslation.create({
      data: {
        subjectType: params.subjectType,
        subjectId: params.subjectId,
        sourceRevisionKey: params.sourceRevisionKey,
        targetLanguage: params.targetLanguage,
        translatedText: result.text,
        aiGenerationId: generation.id,
      },
    });
    return { translatedText: row.translatedText, cached: false };
  } catch (err) {
    // Two concurrent requests for the same (subject, revision, language)
    // can both miss the findUnique above before either create() commits —
    // the loser here just reads back the winner's row rather than erroring.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const row = await db.contentTranslation.findUniqueOrThrow({
        where: {
          subjectType_subjectId_sourceRevisionKey_targetLanguage: {
            subjectType: params.subjectType,
            subjectId: params.subjectId,
            sourceRevisionKey: params.sourceRevisionKey,
            targetLanguage: params.targetLanguage,
          },
        },
      });
      return { translatedText: row.translatedText, cached: true };
    }
    throw err;
  }
}
