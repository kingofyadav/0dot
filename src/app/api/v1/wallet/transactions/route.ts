import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { listTransactions } from "@/lib/wallet/ledger";

// addendum-coin-wallet-v2.md §13.4 — cursor-paginated coin ledger for the
// authenticated user. Cursor is the `nextCursor` from the previous page
// (an ISO timestamp); pass `kind` to filter, `limit` (1–100, default 25).
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "payments:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const kind = url.searchParams.get("kind") ?? undefined;
  const pageLimit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 25));

  const page = await listTransactions(ctx.userId, { cursor, kind, limit: pageLimit });

  return Response.json(page, {
    headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) },
  });
}
