import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";
import { getProfileWikiPage } from "@/lib/wiki";

const KIND_LABEL: Record<string, string> = { wiki: "Wiki page", documentation: "Documentation" };

// Bearer-token counterpart to src/app/[username]/wiki/[slug]/page.tsx.
// Personal wiki/docs pages have no draft/published status (unlike
// Article) — visibility is the only gate: owner sees everything, everyone
// else is blocked only from "private" (unlisted is direct-link/API
// reachable, just excluded from the list route above).
// v1 scope: reading only — comments/likes/editing stay web-only for now.
export async function GET(request: Request, { params }: { params: Promise<{ username: string; slug: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { username: rawHandle, slug: rawSlug } = await params;
  const handle = decodeURIComponent(rawHandle).toLowerCase();
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username?.user.profile) return apiError("Not found.", 404);
  if (await isBlockedEitherWay(ctx.userId, username.userId)) return apiError("Not found.", 404);

  const page = await getProfileWikiPage(username.user.profile.id, slug);
  if (!page) return apiError("Not found.", 404);

  const isOwner = ctx.userId === username.user.id;
  if (!isOwner && page.visibility === "private") return apiError("Not found.", 404);

  return Response.json(
    {
      id: page.id,
      slug: page.slug,
      title: page.title,
      kind: page.kind,
      kindLabel: KIND_LABEL[page.kind] ?? page.kind,
      visibility: page.visibility,
      body: page.currentRevision?.body ?? "",
      isOwner,
      parent: page.parent ? { slug: page.parent.slug, title: page.parent.title } : null,
      children: page.children
        .filter((child) => isOwner || child.visibility !== "private")
        .map((child) => ({ id: child.id, slug: child.slug, title: child.title })),
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
