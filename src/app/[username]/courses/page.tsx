import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EmptyState } from "@/components/EmptyState";

// Public listing surface for spec §11's course landing pages — mirrors
// the [username]/articles listing pattern, but Course has no `visibility`
// field (unlike Article's public/unlisted/private): status "active" is
// the only public-facing state, matching [courseId]/page.tsx's own
// `course.status !== "active" && !isOwner` gate.
export default async function AuthorCoursesPage({ params }: { params: Promise<{ username: string }> }) {
  const { username: rawParam } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username) notFound();

  const courses = await db.course.findMany({
    where: { creatorId: username.userId, status: "active" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="profileCard">
      <Link href={`/${handle}`} className="mutedText" style={{ fontSize: "0.85rem" }}>
        ← {username.user.profile?.displayName ?? handle}
      </Link>
      <h1 style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.6rem" }}>Courses</h1>

      {courses.length === 0 && <EmptyState message="No courses yet." />}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
        {courses.map((course) => (
          <Link
            key={course.id}
            href={`/${handle}/courses/${course.id}`}
            className="profileLinkItem"
            style={{ flexDirection: "column", alignItems: "stretch", gap: "0.15rem" }}
          >
            <strong>{course.title}</strong>
            {course.description && <span className="mutedText">{course.description}</span>}
            <span className="mutedText" style={{ fontSize: "0.8rem" }}>
              {course.price ? `${course.price} ${(course.currency ?? "usd").toUpperCase()}` : "Free"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
