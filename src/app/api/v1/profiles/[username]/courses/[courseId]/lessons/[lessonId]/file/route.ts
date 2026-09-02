import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { hasCourseAccess } from "@/lib/course-access";
import { issueDownloadToken } from "@/lib/protected-storage";

// Bearer-token counterpart to requestLessonFileUrl (src/app/actions/
// courses.ts) — mints a short-lived signed /api/downloads/[token] URL
// (issued here, re-verified again at request time by that route — same
// double-check posture the web action's own comment documents). The
// returned URL is a plain HTTPS link, not itself bearer-authenticated —
// the signed token IS the credential — so the mobile client can just
// GET/open it directly.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ username: string; courseId: string; lessonId: string }> }
) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { courseId, lessonId } = await params;
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
  if (!lesson || lesson.module.courseId !== courseId || !lesson.fileKey) return apiError("This lesson has no file.", 404);
  if (!(await hasCourseAccess(ctx.userId, courseId))) return apiError("You don't have access to this course.", 403);

  const token = issueDownloadToken({ resourceType: "lesson", resourceId: lessonId, userId: ctx.userId });
  return Response.json(
    { url: `/api/downloads/${token}` },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
