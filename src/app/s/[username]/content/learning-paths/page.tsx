import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Route } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteLearningPath } from "@/app/actions/learning-paths";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EmptyState } from "@/components/EmptyState";
import { SettingsRow } from "@/components/SettingsRow";
import { LearningPathForm } from "./LearningPathForm";

export const metadata: Metadata = { title: "Learning paths" };

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

      {courses.length === 0 ? (
        <EmptyState message="Create a course first." />
      ) : (
        <div className="settingsGroup" style={{ marginTop: "1rem" }}>
          <div className="settingsAddPanelBody">
            <LearningPathForm courses={courses} />
          </div>
        </div>
      )}

      {paths.length === 0 ? (
        <EmptyState message="No learning paths yet." />
      ) : (
        <div className="settingsGroup" style={{ marginTop: "1.5rem" }}>
          {paths.map((path) => {
            const courseIds = JSON.parse(path.courseIdsJson) as string[];
            return (
              <SettingsRow
                key={path.id}
                icon={Route}
                label={path.title}
                description={`${courseIds.length} courses`}
                trailing={
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
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
