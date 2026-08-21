import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";

// Mobile pro-upgrade addendum, sub-phase M6. Scoped to what the wallet
// actually supports today (see the addendum's own §2): balance and P2P
// transfer history. No top-up/payout — no code anywhere creates a
// CoinTopUpRequest/CoinPayoutRequest outside the admin-approval actions,
// so there's no user-facing flow on web to mirror yet. VIP/Premium
// purchase (purchaseVipAction) is also deferred — it depends on
// requireOwnProfile's page-route-param auth shape, which doesn't translate
// directly to a bearer-token API route without its own design pass.
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "payments:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const [user, sent, received] = await Promise.all([
    db.user.findUnique({ where: { id: ctx.userId }, select: { coinBalance: true } }),
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
    { coinBalance: user?.coinBalance ?? 0, history },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
