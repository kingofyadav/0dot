"use server";

import { requireOwnProfile } from "@/lib/auth-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAIProvider } from "@/lib/ai-provider";
import { logAIGeneration, markAIGenerationAccepted } from "@/lib/ai-generation";

// phase-11 spec §5.1: both features here only ever return a suggestion for
// the caller to review, edit, and submit through the *existing*
// compose/validation surface (EditProfileForm's own updateProfile action,
// ArticleForm's own createArticle/updateArticle action) — there is no
// AI-only write path. Called directly from a client component (not wired
// through useActionState/a <form action>), same "plain async server
// action, invoked as an RPC" shape as any other button-triggered mutation
// that isn't itself a form submission.
export type AISuggestionResult = { generationId: string; text: string } | { error: string };

async function requireSuggestionRateLimit(userId: string): Promise<{ error: string } | null> {
  // Every invocation has a real inference cost (spec §10.1) — a tighter
  // limit than plain content mutations (createPost etc.), same reasoning
  // rate-limit.ts already documents for signup/login.
  const allowed = checkRateLimit(`ai-suggest:${userId}`, { max: 20, windowMs: 60 * 60 * 1000 });
  return allowed ? null : { error: "You're generating AI suggestions too quickly. Try again in a bit." };
}

export async function suggestProfileBio(context: string): Promise<AISuggestionResult> {
  const user = await requireOwnProfile();
  const limited = await requireSuggestionRateLimit(user.id);
  if (limited) return limited;

  const trimmedContext = context.trim().slice(0, 500);
  const provider = getAIProvider();
  let result: Awaited<ReturnType<typeof provider.suggestText>>;
  try {
    result = await provider.suggestText({ kind: "profile_bio", context: trimmedContext });
  } catch {
    return { error: "AI suggestions are temporarily unavailable. Try again shortly." };
  }

  const generation = await logAIGeneration({
    feature: "profile_builder",
    requestedById: user.id,
    subjectType: "profile",
    subjectId: user.id,
    modelName: result.modelName,
    input: { context: trimmedContext },
    output: { text: result.text },
    costTokens: result.costTokens,
  });

  return { generationId: generation.id, text: result.text };
}

export async function suggestArticleDraft(topic: string): Promise<AISuggestionResult> {
  const user = await requireOwnProfile();
  const limited = await requireSuggestionRateLimit(user.id);
  if (limited) return limited;

  const trimmedTopic = topic.trim().slice(0, 300);
  if (trimmedTopic.length === 0) return { error: "Enter a topic first." };

  const provider = getAIProvider();
  let result: Awaited<ReturnType<typeof provider.suggestText>>;
  try {
    result = await provider.suggestText({ kind: "article_draft", context: trimmedTopic });
  } catch {
    return { error: "AI suggestions are temporarily unavailable. Try again shortly." };
  }

  // subjectId is null: the article may not exist yet (a new-article draft
  // suggestion happens before the first save) — subject_id is nullable in
  // the AIGeneration model for exactly this case.
  const generation = await logAIGeneration({
    feature: "content_writer",
    requestedById: user.id,
    subjectType: "article",
    subjectId: null,
    modelName: result.modelName,
    input: { topic: trimmedTopic },
    output: { text: result.text },
    costTokens: result.costTokens,
  });

  return { generationId: generation.id, text: result.text };
}

// §5.3 acceptance criterion: accepted reflects real use, not mere
// generation — called when the user clicks Insert (true) or Discard
// (false) on the suggestion preview.
export async function recordAISuggestionDecision(generationId: string, accepted: boolean): Promise<void> {
  await requireOwnProfile();
  await markAIGenerationAccepted(generationId, accepted);
}
