import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { registerDeviceToken, unregisterDeviceToken, PUSH_PLATFORMS, type PushPlatform } from "@/lib/push";

// phase-15 build plan step 2: registerDeviceTokenAction/unregisterDeviceTokenAction
// (actions/push.ts) are Next.js server actions — reachable only from this
// app's own React render tree, not from an external bearer-token client.
// This is the REST equivalent a first-party mobile app (§3) actually needs,
// following the same resolveApiRequest-then-rate-limit shape every other
// /v1 route uses (phase-10 build plan's "reused-authorization posture").
//
// appClientId is resolved server-side from the authenticated app (ctx.appId)
// rather than trusted from the request body — DeviceToken.appClientId is
// documented as a logical fk to DeveloperApp.clientId (spec §4.1), and a
// bearer-token-authenticated caller shouldn't be able to register a token
// against a different app than the one its own token was issued for.
async function resolveAppClientId(appId: string): Promise<string | null> {
  const app = await db.developerApp.findUnique({ where: { id: appId }, select: { clientId: true } });
  return app?.clientId ?? null;
}

export async function POST(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "push:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const body = await request.json().catch(() => null);
  const platform = body?.platform;
  const token = body?.token;
  if (!PUSH_PLATFORMS.includes(platform as PushPlatform)) return apiError("Invalid or missing platform.", 400);
  if (!token || typeof token !== "string") return apiError("Missing token.", 400);

  const appClientId = await resolveAppClientId(ctx.appId);
  if (!appClientId) return apiError("Unknown app.", 401);

  await registerDeviceToken({ userId: ctx.userId, platform: platform as PushPlatform, token, appClientId });

  return Response.json(
    { ok: true },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

export async function DELETE(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "push:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const body = await request.json().catch(() => null);
  const token = body?.token;
  if (!token || typeof token !== "string") return apiError("Missing token.", 400);

  await unregisterDeviceToken(ctx.userId, token);

  return Response.json(
    { ok: true },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
