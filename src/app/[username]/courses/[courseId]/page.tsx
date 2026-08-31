import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Lock } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { hasCourseAccess } from "@/lib/course-access";
import { getWalletBalance } from "@/lib/wallet/ledger";
import { markLessonComplete } from "@/app/actions/courses";
import { CourseBuyButton } from "@/components/CourseBuyButton";
import { LessonFileButton } from "@/components/LessonFileButton";
import { QuizWidget } from "@/components/QuizWidget";
import type { QuizQuestion } from "@/app/actions/quizzes";

// spec §11: public course landing + lesson content, gated server-side —
// every lesson's content (video_url/file_url/body) is only ever rendered
// after hasCourseAccess passes, never trusted from a client-reported flag
// (spec §11.2's first criterion, and §13.1's cross-cutting "authorization
// checked server-side at request time" rule).
export default async function CoursePage({
  params,
}: {
  params: Promise<{ username: string; courseId: string }>;
}) {
  const { username: rawParam, courseId } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username) notFound();

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      requiredTier: { select: { id: true, name: true } },
      modules: { orderBy: { position: "asc" }, include: { lessons: { orderBy: { position: "asc" }, include: { quizzes: true } } } },
    },
  });
  if (!course || course.creatorId !== username.userId) notFound();

  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === username.userId;
  if (course.status !== "active" && !isOwner) notFound();

  const access = await hasCourseAccess(currentUser?.id ?? null, courseId);
  const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
  const completedLessonIds = currentUser
    ? new Set(
        (
          await db.courseProgress.findMany({
            where: { userId: currentUser.id, lessonId: { in: lessonIds } },
            select: { lessonId: true },
          })
        ).map((p) => p.lessonId)
      )
    : new Set<string>();

  const quizIds = course.modules.flatMap((m) => m.lessons.flatMap((l) => l.quizzes.map((q) => q.id)));
  const passedQuizIds = currentUser
    ? new Set(
        (
          await db.quizAttempt.findMany({
            where: { userId: currentUser.id, quizId: { in: quizIds }, passed: true },
            select: { quizId: true },
          })
        ).map((a) => a.quizId)
      )
    : new Set<string>();

  const [payoutAccount, viewerWallet] = await Promise.all([
    db.creatorPayoutAccount.findUnique({ where: { userId: username.userId }, select: { status: true } }),
    currentUser && !isOwner ? getWalletBalance(currentUser.id) : Promise.resolve(null),
  ]);
  // The coin rail works with no creator payout account (§6.4).
  const canBuy = !isOwner && currentUser && !access && course.price !== null && course.currency !== null;
  const cardAvailable = payoutAccount?.status === "active";
  const viewerCoins = viewerWallet?.total ?? 0;

  return (
    <div className="profileCard">
      <Link href={`/${handle}`} className="mutedText" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
        <ArrowLeft size={14} aria-hidden="true" /> {username.user.profile?.displayName ?? handle}
      </Link>
      <h1 style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: "0.5rem" }}>{course.title}</h1>
      {course.description && <p className="mutedText" style={{ marginTop: "0.3rem" }}>{course.description}</p>}

      <p className="mutedText" style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
        {course.price !== null && course.currency !== null && `${course.price.toFixed(2)} ${course.currency.toUpperCase()}`}
        {course.price !== null && course.requiredTier && " or "}
        {course.requiredTier && `included with ${course.requiredTier.name} membership`}
      </p>

      {access ? (
        <p className="mutedText" style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
          <Check size={14} aria-hidden="true" /> You have access to this course.
        </p>
      ) : canBuy && course.price !== null && course.currency !== null ? (
        <CourseBuyButton
          courseId={course.id}
          price={course.price}
          currency={course.currency}
          cardAvailable={cardAvailable}
          viewerCoins={viewerCoins}
        />
      ) : (
        !access &&
        !isOwner && (
          <p className="mutedText" style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
            <Lock size={14} aria-hidden="true" /> Purchase or subscribe to unlock this course.
          </p>
        )
      )}

      <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        {course.modules.map((courseModule) => (
          <div key={courseModule.id}>
            <p className="sectionHeading">{courseModule.title}</p>
            {courseModule.lessons.map((lesson) => (
              <div key={lesson.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                    {!access && <Lock size={13} aria-hidden="true" />}
                    {lesson.title}
                    {completedLessonIds.has(lesson.id) && (
                      <span className="mutedText" style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
                        <Check size={13} aria-hidden="true" /> Completed
                      </span>
                    )}
                  </span>
                </div>
                {access && (
                  <>
                    {lesson.contentType === "text" && <p style={{ whiteSpace: "pre-wrap" }}>{lesson.body}</p>}
                    {(lesson.contentType === "video" || lesson.contentType === "download") && (
                      <LessonFileButton lessonId={lesson.id} contentType={lesson.contentType} />
                    )}
                    {currentUser && !completedLessonIds.has(lesson.id) && (
                      <form action={markLessonComplete}>
                        <input type="hidden" name="lessonId" value={lesson.id} />
                        <button type="submit" className="button buttonSecondary buttonSmall">Mark complete</button>
                      </form>
                    )}
                    {currentUser &&
                      lesson.quizzes.map((quiz) =>
                        passedQuizIds.has(quiz.id) ? (
                          <p
                            key={quiz.id}
                            className="mutedText"
                            style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}
                          >
                            <Check size={14} aria-hidden="true" /> Quiz passed
                          </p>
                        ) : (
                          <QuizWidget
                            key={quiz.id}
                            quizId={quiz.id}
                            questions={JSON.parse(quiz.questionsJson) as QuizQuestion[]}
                            passingScore={quiz.passingScore}
                          />
                        )
                      )}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
