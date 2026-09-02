import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createUser } from "@/test/factories";
import { issueAuthorizationCode, exchangeAuthorizationCode } from "@/lib/oauth";
import { GET as getCourseList } from "@/app/api/v1/profiles/[username]/courses/route";
import { GET as getCourseDetail } from "@/app/api/v1/profiles/[username]/courses/[courseId]/route";
import { POST as postProgress } from "@/app/api/v1/profiles/[username]/courses/[courseId]/progress/route";
import { POST as postQuizAttempt } from "@/app/api/v1/profiles/[username]/courses/[courseId]/quiz-attempts/route";
import { POST as postLessonFile } from "@/app/api/v1/profiles/[username]/courses/[courseId]/lessons/[lessonId]/file/route";

async function createPublicClientApp(ownerId: string) {
  return db.developerApp.create({
    data: {
      ownerType: "user",
      ownerUserId: ownerId,
      name: "Course Route Test App",
      description: "test",
      clientId: `client_${randomUUID()}`,
      clientSecretHash: "unused",
      isPublicClient: true,
      redirectUrisJson: JSON.stringify(["https://example.com/callback"]),
    },
  });
}

async function authorizedRequest(viewerId: string, url: string, init?: RequestInit) {
  const app = await createPublicClientApp(viewerId);
  const code = await issueAuthorizationCode({
    appId: app.id,
    userId: viewerId,
    redirectUri: "https://example.com/callback",
    approvedScopes: ["profile:read"],
    codeChallenge: "verifier123",
    codeChallengeMethod: "plain",
  });
  const result = await exchangeAuthorizationCode({ code, codeVerifier: "verifier123", redirectUri: "https://example.com/callback", appId: app.id });
  if ("error" in result) throw new Error(result.error);
  return new Request(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${result.accessToken}` } });
}

async function createCourseWithLessonAndQuiz(creatorId: string) {
  const course = await db.course.create({ data: { creatorId, title: "Test Course", status: "active" } });
  const courseModule = await db.courseModule.create({ data: { courseId: course.id, title: "Module 1", position: 0 } });
  const textLesson = await db.lesson.create({
    data: { moduleId: courseModule.id, title: "Intro", position: 0, contentType: "text", body: "Secret lesson body." },
  });
  const fileLesson = await db.lesson.create({
    data: {
      moduleId: courseModule.id,
      title: "Video lesson",
      position: 1,
      contentType: "video",
      fileKey: `protected/${"a".repeat(32)}.mp4`,
      fileMimeType: "video/mp4",
    },
  });
  const quiz = await db.quiz.create({
    data: {
      lessonId: textLesson.id,
      questionsJson: JSON.stringify([{ question: "2+2?", options: ["3", "4"], correctIndex: 1 }]),
      passingScore: 100,
    },
  });
  return { course, courseModule, textLesson, fileLesson, quiz };
}

describe("course viewing routes", () => {
  it("lists only active courses", async () => {
    const creator = await createUser();
    await db.course.create({ data: { creatorId: creator.id, title: "Active", status: "active" } });
    await db.course.create({ data: { creatorId: creator.id, title: "Draft", status: "draft" } });

    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, `https://0dot.in/api/v1/profiles/${creator.username!.handle}/courses`);
    const res = await getCourseList(req, { params: Promise.resolve({ username: creator.username!.handle }) });
    expect(res.status).toBe(200);
    expect((await res.json()).items.map((c: { title: string }) => c.title)).toEqual(["Active"]);
  });

  it("hides lesson body/quiz questions from a viewer without course access", async () => {
    const creator = await createUser();
    const { course, textLesson } = await createCourseWithLessonAndQuiz(creator.id);

    const viewer = await createUser();
    const req = await authorizedRequest(viewer.id, `https://0dot.in/api/v1/profiles/${creator.username!.handle}/courses/${course.id}`);
    const res = await getCourseDetail(req, { params: Promise.resolve({ username: creator.username!.handle, courseId: course.id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasAccess).toBe(false);
    const lesson = body.modules[0].lessons.find((l: { id: string }) => l.id === textLesson.id);
    expect(lesson.body).toBeNull();
    expect(lesson.quizzes).toEqual([]);
  });

  it("shows lesson body and quiz questions (without correctIndex) once the owner views their own course", async () => {
    const creator = await createUser();
    const { course, textLesson, quiz } = await createCourseWithLessonAndQuiz(creator.id);

    const req = await authorizedRequest(creator.id, `https://0dot.in/api/v1/profiles/${creator.username!.handle}/courses/${course.id}`);
    const res = await getCourseDetail(req, { params: Promise.resolve({ username: creator.username!.handle, courseId: course.id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isOwner).toBe(true);
    expect(body.hasAccess).toBe(true);
    const lesson = body.modules[0].lessons.find((l: { id: string }) => l.id === textLesson.id);
    expect(lesson.body).toBe("Secret lesson body.");
    expect(lesson.quizzes[0].id).toBe(quiz.id);
    expect(lesson.quizzes[0].questions[0]).toEqual({ question: "2+2?", options: ["3", "4"] });
    expect(lesson.quizzes[0].questions[0].correctIndex).toBeUndefined();
  });

  it("rejects marking progress for a viewer without course access", async () => {
    const creator = await createUser();
    const { course, textLesson } = await createCourseWithLessonAndQuiz(creator.id);
    const viewer = await createUser();

    const req = await authorizedRequest(
      viewer.id,
      `https://0dot.in/api/v1/profiles/${creator.username!.handle}/courses/${course.id}/progress`,
      { method: "POST", body: JSON.stringify({ lessonId: textLesson.id }) }
    );
    const res = await postProgress(req, { params: Promise.resolve({ username: creator.username!.handle, courseId: course.id }) });
    expect(res.status).toBe(403);
  });

  it("lets the owner mark their own lesson complete", async () => {
    const creator = await createUser();
    const { course, textLesson } = await createCourseWithLessonAndQuiz(creator.id);

    const req = await authorizedRequest(
      creator.id,
      `https://0dot.in/api/v1/profiles/${creator.username!.handle}/courses/${course.id}/progress`,
      { method: "POST", body: JSON.stringify({ lessonId: textLesson.id }) }
    );
    const res = await postProgress(req, { params: Promise.resolve({ username: creator.username!.handle, courseId: course.id }) });
    expect(res.status).toBe(200);

    const progress = await db.courseProgress.findUnique({ where: { userId_lessonId: { userId: creator.id, lessonId: textLesson.id } } });
    expect(progress).not.toBeNull();
  });

  it("grades a quiz attempt server-side and never trusts a client score", async () => {
    const creator = await createUser();
    const { course, quiz } = await createCourseWithLessonAndQuiz(creator.id);

    const req = await authorizedRequest(
      creator.id,
      `https://0dot.in/api/v1/profiles/${creator.username!.handle}/courses/${course.id}/quiz-attempts`,
      { method: "POST", body: JSON.stringify({ quizId: quiz.id, answers: [1] }) }
    );
    const res = await postQuizAttempt(req, { params: Promise.resolve({ username: creator.username!.handle, courseId: course.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ score: 100, passed: true });
  });

  it("scores a wrong quiz answer as failed", async () => {
    const creator = await createUser();
    const { course, quiz } = await createCourseWithLessonAndQuiz(creator.id);

    const req = await authorizedRequest(
      creator.id,
      `https://0dot.in/api/v1/profiles/${creator.username!.handle}/courses/${course.id}/quiz-attempts`,
      { method: "POST", body: JSON.stringify({ quizId: quiz.id, answers: [0] }) }
    );
    const res = await postQuizAttempt(req, { params: Promise.resolve({ username: creator.username!.handle, courseId: course.id }) });
    const body = await res.json();
    expect(body).toEqual({ score: 0, passed: false });
  });

  it("mints a signed download URL for a lesson file only when the caller has access", async () => {
    const creator = await createUser();
    const { course, fileLesson } = await createCourseWithLessonAndQuiz(creator.id);
    const viewer = await createUser();

    const deniedReq = await authorizedRequest(
      viewer.id,
      `https://0dot.in/api/v1/profiles/${creator.username!.handle}/courses/${course.id}/lessons/${fileLesson.id}/file`,
      { method: "POST" }
    );
    const denied = await postLessonFile(deniedReq, {
      params: Promise.resolve({ username: creator.username!.handle, courseId: course.id, lessonId: fileLesson.id }),
    });
    expect(denied.status).toBe(403);

    const ownerReq = await authorizedRequest(
      creator.id,
      `https://0dot.in/api/v1/profiles/${creator.username!.handle}/courses/${course.id}/lessons/${fileLesson.id}/file`,
      { method: "POST" }
    );
    const allowed = await postLessonFile(ownerReq, {
      params: Promise.resolve({ username: creator.username!.handle, courseId: course.id, lessonId: fileLesson.id }),
    });
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).url).toMatch(/^\/api\/downloads\//);
  });
});
