import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { ALLOW_DMS_FROM_VALUES } from "@/lib/privacy";

// Bearer-token counterpart to PrivacySettingsForm/updatePrivacySettings
// (src/app/actions/profile.ts) — same three Profile fields, same enum.
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "privacy:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const profile = await db.profile.findUnique({
    where: { userId: ctx.userId },
    select: { allowDmsFrom: true, allowTagging: true, discoverableInSearch: true },
  });
  if (!profile) return apiError("Claim a username before editing privacy settings.", 400);

  return Response.json(profile, {
    headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) },
  });
}

export async function PATCH(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "privacy:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const payload = await request.json().catch(() => null);
  if (!payload) return apiError("Invalid request body.", 400);

  const data: { allowDmsFrom?: string; allowTagging?: boolean; discoverableInSearch?: boolean } = {};
  if (payload.allowDmsFrom !== undefined) {
    if (!ALLOW_DMS_FROM_VALUES.has(payload.allowDmsFrom)) {
      return apiError("Choose a valid option for who can message you.", 400);
    }
    data.allowDmsFrom = payload.allowDmsFrom;
  }
  if (typeof payload.allowTagging === "boolean") data.allowTagging = payload.allowTagging;
  if (typeof payload.discoverableInSearch === "boolean") data.discoverableInSearch = payload.discoverableInSearch;

  const existing = await db.profile.findUnique({ where: { userId: ctx.userId }, select: { id: true } });
  if (!existing) return apiError("Claim a username before editing privacy settings.", 400);

  const profile = await db.profile.update({
    where: { userId: ctx.userId },
    data,
    select: { allowDmsFrom: true, allowTagging: true, discoverableInSearch: true },
  });

  return Response.json(profile, {
    headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) },
  });
}
