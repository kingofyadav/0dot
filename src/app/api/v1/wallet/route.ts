import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { getWalletBalance, getBusinessWalletBalance, listBusinessTransactions } from "@/lib/wallet/ledger";
import { isBusinessStaff } from "@/lib/businesses";

// Mobile pro-upgrade addendum M6, extended by addendum-coin-wallet-v2.md
// §13.4: balance + recent activity for the authenticated user, or — with
// `?scope=business&businessId=…` — a business wallet the caller is
// owner/admin of (§6.5). Coin purchases go through POST /wallet/purchases;
// the full ledger is GET /wallet/transactions.
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "payments:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const url = new URL(request.url);
  if (url.searchParams.get("scope") === "business") {
    const businessId = url.searchParams.get("businessId") ?? "";
    if (!businessId) return apiError("businessId is required for scope=business.", 400);
    if (!(await isBusinessStaff(businessId, ctx.userId))) {
      return apiError("You don't have access to this business wallet.", 403);
    }
    const [balance, activity] = await Promise.all([
      getBusinessWalletBalance(businessId),
      listBusinessTransactions(businessId, { limit: 25 }),
    ]);
    return Response.json(
      {
        balance: { spendable: balance.spendable, restricted: balance.restricted, total: balance.total },
        activity: activity.entries,
        nextCursor: activity.nextCursor,
      },
      { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } },
    );
  }

  const [balance, sent, received] = await Promise.all([
    getWalletBalance(ctx.userId),
    db.coinTransfer.findMany({
      where: { fromUserId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { toUser: { include: { username: true, profile: true } } },
    }),
    db.coinTransfer.findMany({
      where: { toUserId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { fromUser: { include: { username: true, profile: true } } },
    }),
  ]);

  const history = [
    ...sent.map((t) => ({
      id: t.id,
      direction: "sent" as const,
      amount: t.amount,
      counterpartyUsername: t.toUser.username?.handle ?? null,
      counterpartyDisplayName: t.toUser.profile?.displayName ?? null,
      createdAt: t.createdAt,
    })),
    ...received.map((t) => ({
      id: t.id,
      direction: "received" as const,
      amount: t.amount,
      counterpartyUsername: t.fromUser.username?.handle ?? null,
      counterpartyDisplayName: t.fromUser.profile?.displayName ?? null,
      createdAt: t.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return Response.json(
    {
      // `coinBalance` (the total) kept for existing clients; `balance`
      // exposes the spendable/restricted split (addendum-coin-wallet-v2.md §13.4).
      coinBalance: balance.total,
      balance: { spendable: balance.spendable, restricted: balance.restricted, total: balance.total },
      history,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
