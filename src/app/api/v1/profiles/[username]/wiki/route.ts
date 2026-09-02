import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";
import { listProfileWikiPages } from "@/lib/wiki";

const KIND_LABEL: Record<string, string> = { wiki: "Wiki page", documentation: "Documentation" };

// Bearer-token counterpart to src/app/[username]/wiki/page.tsx — same
// listProfileWikiPages() helper (top-level pages only), filtered to
// visibility:public exactly as that page does client-side after the query
// (unlisted is direct-link-only, private never appears here).
export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { username: rawHandle } = await params;
  const handle = decodeURIComponent(rawHandle).toLowerCase();
  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username?.user.profile) return apiError("Not found.", 404);
  if (await isBlockedEitherWay(ctx.userId, username.userId)) return apiError("Not found.", 404);

  const allTopLevel = await listProfileWikiPages(username.user.profile.id);
  const pages = allTopLevel.filter((p) => p.visibility === "public");

  return Response.json(
    {
      items: pages.map((page) => ({
        id: page.id,
        slug: page.slug,
        title: page.title,
        kind: page.kind,
        kindLabel: KIND_LABEL[page.kind] ?? page.kind,
      })),
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
