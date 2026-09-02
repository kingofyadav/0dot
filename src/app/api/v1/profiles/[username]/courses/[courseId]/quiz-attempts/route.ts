import { z } from "zod";
import { db } from "@/lib/db";
import { resolveApiRequest, requireScope, requireVerifiedApiUser, apiError } from "@/lib/api-auth";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { hasCourseAccess } from "@/lib/course-access";
import { checkCourseCompletion } from "@/lib/learning-completion";
import type { QuizQuestion } from "@/app/actions/quizzes";

// Bearer-token counterpart to submitQuizAttempt (src/app/actions/
// quizzes.ts) — answers is positional to the quiz's questions, graded
// server-side against each question's correctIndex, never trusting a
// client-reported score (same posture as the web action).
const bodySchema = z.object({ quizId: z.string().min(1), answers: z.array(z.number()) });

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

  const quiz = await db.quiz.findUnique({ where: { id: parsed.data.quizId }, include: { lesson: { include: { module: true } } } });
  if (!quiz || quiz.lesson.module.courseId !== courseId) return apiError("Not found.", 404);
  if (!(await hasCourseAccess(ctx.userId, courseId))) return apiError("You don't have access to this course.", 403);

  const questions = JSON.parse(quiz.questionsJson) as QuizQuestion[];
  const correctCount = questions.filter((q, i) => parsed.data.answers[i] === q.correctIndex).length;
  const score = Math.round((correctCount / questions.length) * 100);
  const passed = score >= quiz.passingScore;

  await db.quizAttempt.create({ data: { quizId: quiz.id, userId: ctx.userId, score, passed } });
  if (passed) await checkCourseCompletion(ctx.userId, courseId);

  return Response.json(
    { score, passed },
    { headers: { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining) } }
  );
}
