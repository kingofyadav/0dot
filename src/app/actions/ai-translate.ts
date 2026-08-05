"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getOrCreateTranslation } from "@/lib/ai-translation";

export type TranslateResult = { text: string } | { error: string };

// Re-derives the identical gate ArticlePage itself applies (owner sees
// everything; everyone else needs published+non-private) — a server action
// is a separate function from the page component so this can't literally
// share a closure with it, but it is the same rule, not a looser one (spec
// §9.2: "verified through the same authorization check, not a separate
// one").
export async function translateArticle(articleId: string, targetLanguage: string): Promise<TranslateResult> {
  const article = await db.article.findUnique({ where: { id: articleId } });
  if (!article) return { error: "Article not found." };

  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === article.authorId;
  if (!isOwner && (article.status !== "published" || article.visibility === "private")) {
    return { error: "Article not found." };
  }
  if (!article.body.trim()) return { error: "Nothing to translate." };

  const { translatedText } = await getOrCreateTranslation({
    subjectType: "article",
    subjectId: article.id,
    sourceRevisionKey: article.updatedAt.toISOString(),
    targetLanguage,
    sourceText: article.body,
    requestedById: currentUser?.id ?? null,
  });
  return { text: translatedText };
}
