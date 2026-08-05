import "server-only";
import { getAIProvider, cosineSimilarity } from "@/lib/ai-provider";
import { logAIGeneration } from "@/lib/ai-generation";

// phase-11 spec §8.1: an additional retrieval signal blended with the
// existing lexical ranking, not a replacement for it — exact-match rows
// (handled by each rank* function in search/page.tsx already) stay pinned
// ahead of everything else; semantic similarity only reorders the
// remaining fuzzy-match rows, since that's where a natural-language/
// conceptual query benefits and precise lookups don't.
//
// §8.2: this computes embeddings on the fly, per query, over rows the
// caller already fetched through its own visibility-filtered WHERE clause
// — there is no persisted vector index at all, so a private row's
// embedding can never exist in one. This is a stronger guarantee than
// "filtered at query time": there is nothing to filter, because nothing is
// ever stored.
export async function semanticRerank<T>(params: {
  query: string;
  rows: T[];
  getText: (row: T) => string;
  getId: (row: T) => string;
  isExactMatch: (row: T) => boolean;
  requestedById?: string | null;
}): Promise<T[]> {
  const { query, rows, getText, getId, isExactMatch, requestedById } = params;
  if (query.trim().length === 0 || rows.length <= 1) return rows;

  const exact = rows.filter(isExactMatch);
  const fuzzy = rows.filter((r) => !isExactMatch(r));
  if (fuzzy.length <= 1) return rows;

  const provider = getAIProvider();
  const queryVector = provider.embed(query);
  const scored = fuzzy
    .map((row) => ({ row, score: cosineSimilarity(queryVector, provider.embed(getText(row))) }))
    .sort((a, b) => b.score - a.score);
  const rerankedFuzzy = scored.map((s) => s.row);

  await logAIGeneration({
    feature: "search_rerank",
    requestedById: requestedById ?? null,
    subjectType: "search_query",
    subjectId: null,
    modelName: provider.modelName,
    input: { query },
    output: { topIds: rerankedFuzzy.slice(0, 10).map(getId) },
    costTokens: fuzzy.length,
  });

  return [...exact, ...rerankedFuzzy];
}
