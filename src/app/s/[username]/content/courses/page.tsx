import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { archiveCourse } from "@/app/actions/courses";
import { CourseForm } from "../../CourseForm";

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
      {myCourses.length === 0 && <p className="mutedText">No courses yet.</p>}
      {myCourses.map((course) => (
        <div key={course.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem", marginBottom: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              <strong>{course.title}</strong>{" "}
              <span className="mutedText">
                {course.price !== null ? `${course.price.toFixed(2)} ${course.currency?.toUpperCase()}` : "Tier-only"} · {course.status}
              </span>
            </span>
            <span style={{ display: "flex", gap: "0.35rem" }}>
              <Link href={`/s/${handle}/content/courses/${course.id}`} className="button buttonSecondary buttonSmall">Manage</Link>
              {course.status !== "archived" && (
                <form action={archiveCourse}>
                  <input type="hidden" name="courseId" value={course.id} />
                  <button type="submit" className="button buttonSecondary buttonSmall">Archive</button>
                </form>
              )}
            </span>
          </div>
          <details className="profileEditToggle">
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Edit details</summary>
            <div style={{ marginTop: "0.5rem" }}>
              <CourseForm course={course} ownTiers={activeTiersForSelect} />
            </div>
          </details>
        </div>
      ))}
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Create a course</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <CourseForm ownTiers={activeTiersForSelect} />
        </div>
      </details>
    </div>
  );
}
