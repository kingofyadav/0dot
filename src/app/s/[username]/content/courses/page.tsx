import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, Pencil, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { archiveCourse } from "@/app/actions/courses";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";
import { CourseForm } from "../../CourseForm";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.username) redirect("/login");
  const handle = currentUser.username.handle;

  const [myCourses, myTiers] = await Promise.all([
    db.course.findMany({ where: { creatorId: currentUser.id }, orderBy: { createdAt: "desc" } }),
    db.membershipTier.findMany({ where: { creatorId: currentUser.id }, orderBy: { level: "asc" } }),
  ]);
  const activeTiersForSelect = myTiers.filter((t) => t.status === "active");

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Courses</h2>
      {myCourses.length === 0 && <EmptyState message="No courses yet." />}
      {myCourses.map((course) => (
        <div key={course.id} className="settingsGroup" style={{ marginBottom: "var(--space-3)" }}>
          <SettingsRow
            icon={GraduationCap}
            label={course.title}
            description={`${course.price !== null ? `${course.price.toFixed(2)} ${course.currency?.toUpperCase()}` : "Tier-only"} · ${course.status}`}
            trailing={
              <>
                <Link href={`/s/${handle}/content/courses/${course.id}`} className="button buttonSecondary buttonSmall">Manage</Link>
                {course.status !== "archived" && (
                  <form action={archiveCourse}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <button type="submit" className="button buttonSecondary buttonSmall">Archive</button>
                  </form>
                )}
              </>
            }
          />
          <details>
            <summary className="settingsRow settingsAddTrigger">
              <span className="settingsRowIcon" aria-hidden="true">
                <Pencil size={16} />
              </span>
              <span className="settingsRowText">
                <span className="settingsRowLabel">Edit details</span>
              </span>
            </summary>
            <div className="settingsAddPanelBody">
              <CourseForm course={course} ownTiers={activeTiersForSelect} />
            </div>
          </details>
        </div>
      ))}
      <details className="settingsGroup">
        <summary className="settingsRow settingsAddTrigger">
          <span className="settingsRowIcon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <span className="settingsRowText">
            <span className="settingsRowLabel">Create a course</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <CourseForm ownTiers={activeTiersForSelect} />
        </div>
      </details>
    </div>
  );
}
