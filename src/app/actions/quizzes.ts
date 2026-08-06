"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { hasCourseAccess } from "@/lib/course-access";
import { checkCourseCompletion } from "@/lib/learning-completion";
import type { ActionState } from "@/app/actions/auth";

export type QuizQuestion = { question: string; options: string[]; correctIndex: number };

function parseQuestions(raw: string): QuizQuestion[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 20) return null;

  const questions: QuizQuestion[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) return null;
    const { question, options, correctIndex } = item as Record<string, unknown>;
    if (typeof question !== "string" || question.trim().length < 1) return null;
    if (!Array.isArray(options) || options.length < 2 || !options.every((o) => typeof o === "string")) return null;
    if (typeof correctIndex !== "number" || correctIndex < 0 || correctIndex >= options.length) return null;
    questions.push({ question: question.trim(), options, correctIndex });
  }
  return questions;
}

// spec §12.1: attaches to Phase 5's existing Lesson — no second
// Course-equivalent content table (§12.3's acceptance criterion).
export async function createQuiz(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireVerifiedUser();
  const lessonId = String(formData.get("lessonId") ?? "");

  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, include: { module: { include: { course: true } } } });
  if (!lesson) return { error: "Lesson not found." };
  if (lesson.module.course.creatorId !== user.id) return { error: "Only the course creator can add a quiz." };

  const questions = parseQuestions(String(formData.get("questionsJson") ?? "[]"));
  if (!questions) return { error: "Add at least one valid question." };

  const passingScore = Number(formData.get("passingScore"));
  if (!Number.isInteger(passingScore) || passingScore < 0 || passingScore > 100) {
    return { error: "Passing score must be a whole number 0-100." };
  }

  await db.quiz.create({
    data: { lessonId, questionsJson: JSON.stringify(questions), passingScore },
  });

  const creatorUsername = await db.username.findUnique({ where: { userId: lesson.module.course.creatorId }, select: { handle: true } });
  if (creatorUsername) revalidatePath(`/${creatorUsername.handle}/courses/${lesson.module.courseId}`);
  return undefined;
}

export type QuizSubmitState = { error: string } | { score: number; passed: boolean } | undefined;

// answers is a JSON array of chosen option indexes, positional to the
// quiz's questionsJson — graded server-side against correctIndex, never
// trusting a client-reported score.
export async function submitQuizAttempt(_prevState: QuizSubmitState, formData: FormData): Promise<QuizSubmitState> {
  const user = await requireVerifiedUser();
  const quizId = String(formData.get("quizId") ?? "");

  const quiz = await db.quiz.findUnique({ where: { id: quizId }, include: { lesson: { include: { module: true } } } });
  if (!quiz) return { error: "Quiz not found." };
  if (!(await hasCourseAccess(user.id, quiz.lesson.module.courseId))) return { error: "You don't have access to this course." };

  let answers: unknown;
  try {
    answers = JSON.parse(String(formData.get("answersJson") ?? "[]"));
  } catch {
    return { error: "Invalid submission." };
  }
  if (!Array.isArray(answers)) return { error: "Invalid submission." };

  const questions = JSON.parse(quiz.questionsJson) as QuizQuestion[];
  const correctCount = questions.filter((q, i) => answers[i] === q.correctIndex).length;
  const score = Math.round((correctCount / questions.length) * 100);
  const passed = score >= quiz.passingScore;

  await db.quizAttempt.create({ data: { quizId, userId: user.id, score, passed } });

  if (passed) await checkCourseCompletion(user.id, quiz.lesson.module.courseId);

  return { score, passed };
}
