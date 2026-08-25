import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { getUnreadConversationCount } from "@/lib/messaging";
import { getUnreadNotificationCount } from "@/lib/notifications";

// Mobile pro-upgrade addendum, sub-phase M13 (tab-bar unread badges).
// Same two counts src/app/api/browser-tab/unread-count/route.ts already
// combines into one number for the web tab favicon/title badge — split
// here instead of summed, since the mobile tab bar needs to badge the
// Messages and Notifications icons independently, not a single blended
// count. Requires both scopes since it reads across both domains in one
// request; a client authorized for only one would need its own narrower
// route, which none of the current OAuth clients are (both scopes are
// auto-approved for the first-party app, same as every other route here).
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const messagesScopeError = requireScope(ctx, "messages:read");
  if (messagesScopeError) return apiError(messagesScopeError.error, messagesScopeError.status);
  const notificationsScopeError = requireScope(ctx, "notifications:read");
  if (notificationsScopeError) return apiError(notificationsScopeError.error, notificationsScopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const [messages, notifications] = await Promise.all([
    getUnreadConversationCount(ctx.userId),
    getUnreadNotificationCount(ctx.userId),
  ]);

  return Response.json(
    { messages, notifications },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
