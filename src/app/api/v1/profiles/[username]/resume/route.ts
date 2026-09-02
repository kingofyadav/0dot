import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";

// Bearer-token counterpart to src/app/[username]/resume/page.tsx — a pure
// recomposition of Profile fields (skills/workExperiences/education) plus
// featured Projects, same as that page; no separate resume-only data model
// or query path to keep in sync with.
export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { username: rawHandle } = await params;
  const handle = decodeURIComponent(rawHandle).toLowerCase();
  const username = await db.username.findUnique({
    where: { handle },
    include: {
      user: {
        include: {
          profile: {
            include: {
              skills: { orderBy: { position: "asc" } },
              workExperiences: { orderBy: { position: "asc" } },
              education: { orderBy: { position: "asc" } },
            },
          },
        },
      },
    },
  });
  if (!username || !username.user.profile) return apiError("Not found.", 404);
  if (await isBlockedEitherWay(ctx.userId, username.userId)) return apiError("Not found.", 404);

  const profile = username.user.profile;
  const featuredProjects = await db.project.findMany({
    where: { ownerId: username.userId, featuredOnResume: true, visibility: "public", status: { not: "archived" } },
    select: { id: true, slug: true, title: true, summary: true },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(
    {
      resumePdfUrl: profile.resumePdfUrl,
      workExperiences: profile.workExperiences.map((item) => ({
        id: item.id,
        title: item.title,
        company: item.company,
        location: item.location,
        startDate: item.startDate,
        endDate: item.endDate,
        description: item.description,
      })),
      education: profile.education.map((item) => ({
        id: item.id,
        institution: item.institution,
        degree: item.degree,
        fieldOfStudy: item.fieldOfStudy,
        startDate: item.startDate,
        endDate: item.endDate,
        description: item.description,
      })),
      skills: profile.skills.map((skill) => ({ id: skill.id, name: skill.name })),
      featuredProjects: featuredProjects.map((project) => ({
        id: project.id,
        slug: project.slug,
        title: project.title,
        summary: project.summary,
      })),
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
