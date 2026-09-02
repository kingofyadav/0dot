import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { isBlockedEitherWay } from "@/lib/blocks";
import { hasCourseAccess } from "@/lib/course-access";
import type { QuizQuestion } from "@/app/actions/quizzes";

// Bearer-token counterpart to src/app/[username]/courses/[courseId]/page.tsx.
// Every lesson's real content (body/file) is only ever included once
// hasCourseAccess passes — never trusted from a client-reported flag, same
// server-side-gating posture as that page. Quiz `correctIndex` is
// stripped from every response (the web page currently ships it to the
// client unstripped via JSON.parse(questionsJson) — not mirrored here:
// grading is server-side either way, so there's no reason for a mobile
// client to ever see the answer key).
export async function GET(request: Request, { params }: { params: Promise<{ username: string; courseId: string }> }) {
  const ctx = await resolveApiRequest(request);
  if ("error" in ctx) return apiError(ctx.error, ctx.status);

  const scopeError = requireScope(ctx, "profile:read");
  if (scopeError) return apiError(scopeError.error, scopeError.status);

  const { allowed, limit, remaining } = await checkApiRateLimit(ctx.appId);
  if (!allowed) return apiError("Rate limit exceeded.", 429);

  const { username: rawHandle, courseId } = await params;
  const handle = decodeURIComponent(rawHandle).toLowerCase();
  const username = await db.username.findUnique({ where: { handle } });
  if (!username) return apiError("Not found.", 404);
  if (await isBlockedEitherWay(ctx.userId, username.userId)) return apiError("Not found.", 404);

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      requiredTier: { select: { id: true, name: true } },
      modules: { orderBy: { position: "asc" }, include: { lessons: { orderBy: { position: "asc" }, include: { quizzes: true } } } },
    },
  });
  if (!course || course.creatorId !== username.userId) return apiError("Not found.", 404);

  const isOwner = ctx.userId === username.userId;
  if (course.status !== "active" && !isOwner) return apiError("Not found.", 404);

  const access = isOwner || (await hasCourseAccess(ctx.userId, courseId));

  const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
  const completedLessonIds = new Set(
    (await db.courseProgress.findMany({ where: { userId: ctx.userId, lessonId: { in: lessonIds } }, select: { lessonId: true } })).map(
      (p) => p.lessonId
    )
  );
  const quizIds = course.modules.flatMap((m) => m.lessons.flatMap((l) => l.quizzes.map((q) => q.id)));
  const passedQuizIds = new Set(
    (
      await db.quizAttempt.findMany({ where: { userId: ctx.userId, quizId: { in: quizIds }, passed: true }, select: { quizId: true } })
    ).map((a) => a.quizId)
  );

  return Response.json(
    {
      id: course.id,
      title: course.title,
      description: course.description,
      price: course.price,
      currency: course.currency,
      requiredTier: course.requiredTier,
      status: course.status,
      isOwner,
      hasAccess: access,
      modules: course.modules.map((courseModule) => ({
        id: courseModule.id,
        title: courseModule.title,
        lessons: courseModule.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          contentType: lesson.contentType,
          isCompleted: completedLessonIds.has(lesson.id),
          hasFile: Boolean(lesson.fileKey),
          // Only ever included once access is confirmed — see file comment.
          body: access && lesson.contentType === "text" ? lesson.body : null,
          quizzes: access
            ? lesson.quizzes.map((quiz) => ({
                id: quiz.id,
                passingScore: quiz.passingScore,
                passed: passedQuizIds.has(quiz.id),
                questions: (JSON.parse(quiz.questionsJson) as QuizQuestion[]).map((q) => ({ question: q.question, options: q.options })),
              }))
            : [],
        })),
      })),
    },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
