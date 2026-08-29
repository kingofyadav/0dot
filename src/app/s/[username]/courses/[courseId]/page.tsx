import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Layers, Pencil, PlayCircle, Plus, X } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteModule, deleteLesson } from "@/app/actions/courses";
import { CourseForm } from "@/app/s/[username]/CourseForm";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmButton } from "@/components/ConfirmButton";
import { AddModuleForm } from "./AddModuleForm";
import { AddLessonForm } from "./AddLessonForm";
import { QuizForm } from "./QuizForm";

// Best-effort only — access control stays solely the page component's job
// (below), which already does the real ownership check against the fully
// loaded course. A lookup miss here just falls back to a generic title
// instead of duplicating notFound()/redirect() logic in a second place.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseId: string }>;
}): Promise<Metadata> {
  const { courseId } = await params;
  const currentUser = await getCurrentUser();
  const course = currentUser
    ? await db.course.findUnique({ where: { id: courseId }, select: { title: true, creatorId: true } })
    : null;
  return { title: course && course.creatorId === currentUser?.id ? course.title : "Course" };
}

// spec §11: owner-only course builder, same "/s/ prefix = control panel"
// split as the rest of settings — modules/lessons are managed here, never
// on the public course page (/[username]/courses/[courseId]).
export default async function CourseBuilderPage({
  params,
}: {
  params: Promise<{ username: string; courseId: string }>;
}) {
  const { username: rawParam, courseId } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.username?.handle !== handle) redirect(`/s/${currentUser.username?.handle ?? ""}`);

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { modules: { orderBy: { position: "asc" }, include: { lessons: { orderBy: { position: "asc" }, include: { quizzes: true } } } } },
  });
  if (!course || course.creatorId !== currentUser.id) notFound();

  const ownTiers = await db.membershipTier.findMany({ where: { creatorId: currentUser.id, status: "active" } });

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{course.title}</h1>
        <Link href={`/s/${handle}`} className="button buttonSecondary">Back to settings</Link>
      </div>

      <details className="settingsGroup">
        <summary className="settingsRow settingsAddTrigger">
          <span className="settingsRowIcon" aria-hidden="true">
            <Pencil size={16} />
          </span>
          <span className="settingsRowText">
            <span className="settingsRowLabel">Course details</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <CourseForm course={course} ownTiers={ownTiers} />
        </div>
      </details>

      <div style={{ marginTop: "1.25rem" }}>
        <p className="settingsGroupLabel">Modules</p>
        {course.modules.length === 0 && <EmptyState message="No modules yet." />}
        {course.modules.map((courseModule) => (
          <div key={courseModule.id} className="settingsGroup" style={{ marginBottom: "var(--space-3)" }}>
            <SettingsRow
              icon={Layers}
              label={courseModule.title}
              trailing={
                <form action={deleteModule}>
                  <input type="hidden" name="moduleId" value={courseModule.id} />
                  <ConfirmButton
                    className="button buttonSecondary buttonSmall"
                    title="Delete this module?"
                    description="This deletes every lesson in it too. This can't be undone."
                    confirmLabel="Delete"
                  >
                    Delete module
                  </ConfirmButton>
                </form>
              }
            />

            {courseModule.lessons.length === 0 && (
              <p className="mutedText" style={{ fontSize: "0.85rem", padding: "0 var(--space-4) var(--space-3)" }}>No lessons yet.</p>
            )}
            {courseModule.lessons.map((lesson) => (
              <SettingsRow
                key={lesson.id}
                icon={PlayCircle}
                label={lesson.title}
                description={`${lesson.contentType}${lesson.quizzes.length > 0 ? " · has quiz" : ""}`}
                trailing={
                  <form action={deleteLesson}>
                    <input type="hidden" name="lessonId" value={lesson.id} />
                    <ConfirmButton
                      className="button buttonSecondary iconButton"
                      title="Delete this lesson?"
                      description="This can't be undone."
                      confirmLabel="Delete"
                      aria-label="Delete lesson"
                    >
                      <X size={16} aria-hidden="true" />
                    </ConfirmButton>
                  </form>
                }
              />
            ))}
            {courseModule.lessons.filter((l) => l.quizzes.length === 0).map((lesson) => (
              <details key={`quiz-${lesson.id}`}>
                <summary className="settingsRow settingsAddTrigger">
                  <span className="settingsRowIcon" aria-hidden="true">
                    <Plus size={16} />
                  </span>
                  <span className="settingsRowText">
                    <span className="settingsRowLabel">Add quiz to &ldquo;{lesson.title}&rdquo;</span>
                  </span>
                </summary>
                <div className="settingsAddPanelBody">
                  <QuizForm lessonId={lesson.id} />
                </div>
              </details>
            ))}

            <details>
              <summary className="settingsRow settingsAddTrigger">
                <span className="settingsRowIcon" aria-hidden="true">
                  <Plus size={16} />
                </span>
                <span className="settingsRowText">
                  <span className="settingsRowLabel">Add lesson</span>
                </span>
              </summary>
              <div className="settingsAddPanelBody">
                <AddLessonForm moduleId={courseModule.id} />
              </div>
            </details>
          </div>
        ))}

        <div className="settingsGroup">
          <div className="settingsAddPanelBody">
            <AddModuleForm courseId={course.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
