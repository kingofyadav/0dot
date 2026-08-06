import "server-only";
import { db } from "@/lib/db";

// phase-16 spec §12.2: completing a Course (every lesson viewed, every
// required Quiz passed) or LearningPath (every constituent Course complete)
// auto-creates a Certificate (Phase 6 §7.2) — a verifiable, portfolio-
// displayed record, not a learning-platform-specific completion record
// (§12.3's acceptance criterion).
async function isCourseComplete(userId: string, courseId: string): Promise<boolean> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { modules: { include: { lessons: { include: { quizzes: true } } } } },
  });
  if (!course) return false;

  const lessons = course.modules.flatMap((courseModule) => courseModule.lessons);
  const quizIds = lessons.flatMap((lesson) => lesson.quizzes.map((quiz) => quiz.id));

  // Batched instead of one findUnique/findFirst per lesson/quiz — this ran
  // on every markLessonComplete/quiz-submission call, so a course with N
  // lessons and M quizzes used to fire up to N+M sequential round-trips per
  // click; two queries (three including the course fetch above) cover the
  // whole course regardless of size.
  const [completedProgress, passedAttempts] = await Promise.all([
    lessons.length > 0
      ? db.courseProgress.findMany({
          where: { userId, lessonId: { in: lessons.map((lesson) => lesson.id) } },
          select: { lessonId: true },
        })
      : Promise.resolve([]),
    quizIds.length > 0
      ? db.quizAttempt.findMany({
          where: { userId, quizId: { in: quizIds }, passed: true },
          select: { quizId: true },
        })
      : Promise.resolve([]),
  ]);
  const completedLessonIds = new Set(completedProgress.map((p) => p.lessonId));
  const passedQuizIds = new Set(passedAttempts.map((a) => a.quizId));

  for (const lesson of lessons) {
    if (!completedLessonIds.has(lesson.id)) return false;
    for (const quiz of lesson.quizzes) {
      if (!passedQuizIds.has(quiz.id)) return false;
    }
  }
  return true;
}

async function grantCertificateOnce(
  userId: string,
  credentialId: string,
  data: { title: string; issuingOrg: string }
): Promise<void> {
  const profile = await db.profile.findUnique({ where: { userId } });
  if (!profile) return;

  const existing = await db.certificate.findFirst({ where: { profileId: profile.id, credentialId } });
  if (existing) return;

  await db.certificate.create({
    data: { profileId: profile.id, title: data.title, issuingOrg: data.issuingOrg, issueDate: new Date(), credentialId },
  });
}

async function checkLearningPathCompletion(userId: string, path: { id: string; title: string; courseIdsJson: string }): Promise<void> {
  const courseIds = JSON.parse(path.courseIdsJson) as string[];
  for (const courseId of courseIds) {
    if (!(await isCourseComplete(userId, courseId))) return;
  }
  await grantCertificateOnce(userId, `learning_path:${path.id}`, {
    title: `${path.title} — Learning Path Completion`,
    issuingOrg: "0dot",
  });
}

// Called after any event that could complete a course (lesson viewed, quiz
// passed) — re-checks completion and any LearningPath this course belongs
// to, rather than tracking completion state separately.
export async function checkCourseCompletion(userId: string, courseId: string): Promise<void> {
  if (await isCourseComplete(userId, courseId)) {
    const course = await db.course.findUnique({ where: { id: courseId }, include: { creator: { include: { profile: true } } } });
    if (course) {
      await grantCertificateOnce(userId, `course:${courseId}`, {
        title: `${course.title} — Course Completion`,
        issuingOrg: course.creator.profile?.displayName ?? "0dot",
      });
    }
  }

  const paths = await db.learningPath.findMany({ where: { courseIdsJson: { contains: courseId } } });
  for (const path of paths) {
    await checkLearningPathCompletion(userId, path);
  }
}
