import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { revokeAllOtherSessions } from "@/app/actions/session-management";

// Reuses revokeAllOtherSessions (session-management.ts) directly — it
// excludes the caller's *own* cookie session token via getCurrentSessionToken(),
// which reads next/headers' cookies() and simply finds none for a
// bearer-token request (mobile never creates a Session row at all, see this
// addendum's own note on that distinction). That resolves currentTokenHash
// to "", so the deleteMany's `tokenHash: { not: "" }` matches every real
// session — exactly "revoke every one of my web sessions," which is the
// only sensible meaning of "others" when there's no session of this
// caller's own to spare. Same function changePassword (auth.ts) already
// calls, not a second copy of the query.
export async function POST(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "account:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  await revokeAllOtherSessions(ctx.userId);

  return Response.json(
    { ok: true },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
