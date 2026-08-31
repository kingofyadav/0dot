import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { getReferralStats } from "@/lib/wallet/referral";

// addendum-coin-wallet-v2.md §13.4 — the caller's referral code plus how
// many invites have been rewarded. Share link: 0dot.in/join/<code>.
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "payments:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const stats = await getReferralStats(ctx.userId);

  return Response.json(
    {
      code: stats.code,
      joinUrl: `/join/${stats.code}`,
      attributedSignups: stats.attributedSignups,
      rewardedInvites: stats.rewardedInvites,
      maxRewardedInvites: stats.maxRewarded,
      rewardCoinsPerInvite: stats.rewardCoins,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } },
  );
}
