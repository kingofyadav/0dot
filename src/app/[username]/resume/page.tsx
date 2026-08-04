import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

function formatDate(date: Date | null): string {
  return date ? date.toLocaleDateString(undefined, { year: "numeric", month: "short" }) : "Present";
}

// spec §6.2/§6.3: a *rendering* of data that already exists elsewhere on
// the profile (WorkExperience, Education, Skill, featured Projects) — no
// separate resume-only data entry step, and no separate query path either;
// this page just assembles the same rows the profile/skills/projects
// sections already show.
export default async function ResumePage({ params }: { params: Promise<{ username: string }> }) {
  const { username: rawParam } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();

  const username = await db.username.findUnique({
    where: { handle },
    include: {
      user: {
        include: {
          profile: {
            include: {
              skills: { orderBy: { position: "asc" } },
              workExperiences: { orderBy: { position: "asc" } },
              education: { orderBy: { position: "asc" } },
            },
          },
        },
      },
    },
  });
  if (!username || !username.user.profile) notFound();

  const profile = username.user.profile;
  const featuredProjects = await db.project.findMany({
    where: { ownerId: username.userId, featuredOnResume: true, visibility: "public", status: { not: "archived" } },
    select: { id: true, slug: true, title: true, summary: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="profileCard">
      <Link href={`/${handle}`} className="mutedText" style={{ fontSize: "0.85rem" }}>
        ← {profile.displayName}
      </Link>
      <h1 style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: "0.5rem" }}>{profile.displayName}&rsquo;s résumé</h1>

      {profile.resumePdfUrl && (
        <p style={{ marginTop: "0.4rem" }}>
          <a href={profile.resumePdfUrl} target="_blank" rel="noopener noreferrer" className="button buttonSecondary buttonSmall">
            Download PDF
          </a>
        </p>
      )}

      {profile.workExperiences.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <p className="sectionHeading">Work experience</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {profile.workExperiences.map((item) => (
              <div key={item.id}>
                <strong>{item.title}</strong> — {item.company}
                {item.location && <span className="mutedText"> · {item.location}</span>}
                <p className="mutedText" style={{ margin: "0.1rem 0 0", fontSize: "0.85rem" }}>
                  {formatDate(item.startDate)} – {formatDate(item.endDate)}
                </p>
                {item.description && <p style={{ marginTop: "0.2rem", whiteSpace: "pre-wrap" }}>{item.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {profile.education.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <p className="sectionHeading">Education</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {profile.education.map((item) => (
              <div key={item.id}>
                <strong>{item.institution}</strong>
                {item.degree && <span> — {item.degree}</span>}
                {item.fieldOfStudy && <span className="mutedText"> · {item.fieldOfStudy}</span>}
                <p className="mutedText" style={{ margin: "0.1rem 0 0", fontSize: "0.85rem" }}>
                  {formatDate(item.startDate)} – {formatDate(item.endDate)}
                </p>
                {item.description && <p style={{ marginTop: "0.2rem", whiteSpace: "pre-wrap" }}>{item.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {profile.skills.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <p className="sectionHeading">Skills</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {profile.skills.map((skill) => (
              <span key={skill.id} className="mutedText" style={{ fontSize: "0.85rem", border: "1px solid var(--border)", borderRadius: "999px", padding: "0.15rem 0.6rem" }}>
                {skill.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {featuredProjects.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <p className="sectionHeading">Projects</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {featuredProjects.map((project) => (
              <Link key={project.id} href={`/p/${project.slug}`}>
                {project.title}
                {project.summary && <span className="mutedText"> — {project.summary}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
