import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { setDeliveryPreference } from "@/lib/push";
import { EMAIL_NOTIFICATION_TYPES } from "@/lib/email";

// Mirrors s/[username]/notifications/page.tsx's own curated catalog —
// duplicated rather than imported since that file is a page component
// (React Server Component with its own render-only imports), not a shared
// lib; same "small catalog duplicated across a boundary" posture already
// used elsewhere in this API (e.g. POST /posts's rate-limit key). Keep in
// sync with that page's PUSH_NOTIFICATION_TYPES if it ever changes.
const PUSH_NOTIFICATION_TYPES = [
  "like",
  "comment",
  "mention",
  "new_follower",
  "message",
  "community_update",
  "tip_received",
  "coins_received",
  "new_subscriber",
  "livestream_started",
  "event_cancelled",
  "ticket_purchased",
  "appointment_request",
] as const;

export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "notifications:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const [pushPrefs, emailPrefs, deviceCount] = await Promise.all([
    db.notificationDeliveryPreference.findMany({ where: { userId: ctx.userId, channel: "push" } }),
    db.notificationDeliveryPreference.findMany({ where: { userId: ctx.userId, channel: "email" } }),
    db.deviceToken.count({ where: { userId: ctx.userId } }),
  ]);
  const pushByType = new Map(pushPrefs.map((p) => [p.notificationType, p.enabled]));
  const emailByType = new Map(emailPrefs.map((p) => [p.notificationType, p.enabled]));

  return Response.json(
    {
      // No row for a type means "enabled" (schema default) — resolved here
      // rather than left for the client to guess, same posture as the web
      // settings page's own `?? true` fallback.
      push: PUSH_NOTIFICATION_TYPES.map((type) => ({ type, enabled: pushByType.get(type) ?? true })),
      email: EMAIL_NOTIFICATION_TYPES.map((type) => ({ type, enabled: emailByType.get(type) ?? true })),
      deviceCount,
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}

export async function PATCH(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "notifications:write");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const payload = await request.json().catch(() => null);
  const notificationType = String(payload?.notificationType ?? "");
  const channel = String(payload?.channel ?? "");
  const enabled = payload?.enabled;

  if (channel !== "push" && channel !== "email") return apiError("channel must be 'push' or 'email'.", 400);
  const validTypes: readonly string[] = channel === "push" ? PUSH_NOTIFICATION_TYPES : EMAIL_NOTIFICATION_TYPES;
  if (!validTypes.includes(notificationType)) return apiError("Unknown notificationType for this channel.", 400);
  if (typeof enabled !== "boolean") return apiError("enabled must be a boolean.", 400);

  await setDeliveryPreference({ userId: ctx.userId, notificationType, channel, enabled });

  return Response.json(
    { ok: true },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
