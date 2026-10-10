import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";

// ZERO ID trust layer (../ZERO-ID-TRUST-ARCHITECTURE.md §4.1, sibling to
// this repo under 0dotindia/ — not part of this repo's own docs/specs): the
// one endpoint a relying site (e.g. kingofyadav.in, zerosoils.com) calls to
// read a narrow set of verification/standing claims about the signed-in
// user — never their profile content or social graph, and never anything
// account:read's higher-sensitivity session/export surface already covers.
// Same resolveApiRequest → requireScope → checkApiRateLimit → read shape as
// every other /api/v1 route (see users/me/route.ts); revocation needs no
// separate handling here since resolveApiRequest already fails closed the
// instant the underlying OAuthToken row is gone.
//
// phoneVerified is deliberately omitted: User.phone has no phoneVerifiedAt
// column today (collected at signup, never OTP-verified), so returning a
// claim named "verified" off bare presence would be misleading to a relying
// site. Add it once phone verification is real, not before.
//
// id is included (not a "claim" — the subject these claims are about):
// without it, a relying site requesting trust:read alone (per the
// architecture doc's own "zerosoils should request only trust:read, not
// profile:read" guidance) would have no stable identifier to store against
// at all. Exposing the bare opaque id costs nothing privacy-wise beyond
// what granting any scope already implies — every other /api/v1 scope's
// endpoint already tells the caller which account it's reading.
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "trust:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      emailVerifiedAt: true,
      twoFactorEnabledAt: true,
      ageVerifiedAt: true,
    },
  });
  if (!user) return apiError("Not found.", 404);

  const accountAgeDays = Math.floor((Date.now() - user.createdAt.getTime()) / (24 * 60 * 60 * 1000));

  return Response.json(
    {
      id: user.id,
      emailVerified: user.emailVerifiedAt !== null,
      twoFactorEnabled: user.twoFactorEnabledAt !== null,
      accountStatus: user.status,
      accountAgeDays,
      ageVerified: user.ageVerifiedAt !== null,
      asOf: new Date().toISOString(),
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
