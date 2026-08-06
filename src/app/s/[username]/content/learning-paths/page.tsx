import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteLearningPath } from "@/app/actions/learning-paths";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EmptyState } from "@/components/EmptyState";
import { LearningPathForm } from "./LearningPathForm";

export default async function LearningPathsSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const [courses, paths] = await Promise.all([
    db.course.findMany({ where: { creatorId: currentUser.id }, select: { id: true, title: true }, orderBy: { createdAt: "asc" } }),
    db.learningPath.findMany({ where: { creatorId: currentUser.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Learning paths</h2>
      <p className="mutedText" style={{ fontSize: "0.9rem" }}>
        A curriculum spanning multiple of your courses. Completing every course in a path awards a certificate automatically.
      </p>

      <div style={{ marginTop: "1rem" }}>
        {courses.length === 0 ? (
          <p className="mutedText">Create a course first.</p>
        ) : (
          <LearningPathForm courses={courses} />
        )}
      </div>

      <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {paths.length === 0 && <EmptyState message="No learning paths yet." />}
        {paths.map((path) => {
          const courseIds = JSON.parse(path.courseIdsJson) as string[];
          return (
            <div key={path.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.6rem 0.8rem" }}>
              <div>
                <strong>{path.title}</strong>
                <p className="mutedText" style={{ margin: 0, fontSize: "0.8rem" }}>{courseIds.length} courses</p>
              </div>
              <form action={deleteLearningPath}>
                <input type="hidden" name="pathId" value={path.id} />
                <ConfirmButton
                  className="button buttonSecondary iconButton"
                  aria-label="Delete learning path"
                  title="Delete this learning path?"
                  description="Learners keep any certificate already earned."
                  confirmLabel="Delete"
                >
                  ×
                </ConfirmButton>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
