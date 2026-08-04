import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteModule, deleteLesson } from "@/app/actions/courses";
import { CourseForm } from "@/app/s/[username]/CourseForm";
import { AddModuleForm } from "./AddModuleForm";
import { AddLessonForm } from "./AddLessonForm";

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
    include: { modules: { orderBy: { position: "asc" }, include: { lessons: { orderBy: { position: "asc" } } } } },
  });
  if (!course || course.creatorId !== currentUser.id) notFound();

  const ownTiers = await db.membershipTier.findMany({ where: { creatorId: currentUser.id, status: "active" } });

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{course.title}</h1>
        <Link href={`/s/${handle}`} className="button buttonSecondary">Back to settings</Link>
      </div>

      <details className="profileEditToggle">
        <summary>Course details</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <CourseForm course={course} ownTiers={ownTiers} />
        </div>
      </details>

      <div style={{ marginTop: "1.25rem" }}>
        <p className="sectionHeading">Modules</p>
        {course.modules.length === 0 && <p className="mutedText">No modules yet.</p>}
        {course.modules.map((courseModule) => (
          <div key={courseModule.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{courseModule.title}</strong>
              <form action={deleteModule}>
                <input type="hidden" name="moduleId" value={courseModule.id} />
                <button type="submit" className="button buttonSecondary buttonSmall">Delete module</button>
              </form>
            </div>

            {courseModule.lessons.length === 0 && <p className="mutedText" style={{ fontSize: "0.85rem" }}>No lessons yet.</p>}
            {courseModule.lessons.map((lesson) => (
              <div key={lesson.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingInlineStart: "0.5rem" }}>
                <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                  {lesson.title} ({lesson.contentType})
                </span>
                <form action={deleteLesson}>
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete lesson">✕</button>
                </form>
              </div>
            ))}

            <details className="profileEditToggle">
              <summary className="mutedText" style={{ fontSize: "0.85rem" }}>+ Add lesson</summary>
              <div style={{ marginTop: "0.5rem" }}>
                <AddLessonForm moduleId={courseModule.id} />
              </div>
            </details>
          </div>
        ))}

        <AddModuleForm courseId={course.id} />
      </div>
    </div>
  );
}
