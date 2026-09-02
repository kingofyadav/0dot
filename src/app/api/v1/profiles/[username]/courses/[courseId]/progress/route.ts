import { z } from "zod";
import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { hasCourseAccess } from "@/lib/course-access";
import { checkCourseCompletion } from "@/lib/learning-completion";

// Bearer-token counterpart to markLessonComplete (src/app/actions/
// courses.ts) — same access re-check and upsert.
const bodySchema = z.object({ lessonId: z.string().min(1) });

export async function POST(request: Request, { params }: { params: Promise<{ username: string; courseId: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const verifiedError = await requireVerifiedApiUser(ctx);
  if (verifiedError) return apiError(verifiedError.error, verifiedError.status);

  const { courseId } = await params;
  const payload = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload ?? {});
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid request body.", 400);

  const lesson = await db.lesson.findUnique({ where: { id: parsed.data.lessonId }, include: { module: true } });
  if (!lesson || lesson.module.courseId !== courseId) return apiError("Not found.", 404);
  if (!(await hasCourseAccess(ctx.userId, courseId))) return apiError("You don't have access to this course.", 403);

  await db.courseProgress.upsert({
    where: { userId_lessonId: { userId: ctx.userId, lessonId: lesson.id } },
    create: { userId: ctx.userId, lessonId: lesson.id },
    update: {},
  });
  await checkCourseCompletion(ctx.userId, courseId);

  return Response.json({ ok: true }, { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } });
}
