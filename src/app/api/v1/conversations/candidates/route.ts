import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { getMessageableCandidates } from "@/lib/messaging";

// Who a "new message" picker on mobile can list — reuses the same
// follow-graph candidate pool the web new-DM/new-group pickers already
// draw from (messaging.ts's own comment: no global user search exists for
// this yet), rather than repurposing GET /api/v1/search's users tab, which
// searches every discoverable account platform-wide, not just people this
// viewer can actually start a conversation with for free.
export async function GET(request: Request) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "messages:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const candidates = await getMessageableCandidates(ctx.userId);

  return Response.json(
    { items: candidates },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
