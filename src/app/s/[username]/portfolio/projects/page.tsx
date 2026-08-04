import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { archiveProject, removeCollaborator } from "@/app/actions/projects";
import { ProjectForm } from "../../ProjectForm";
import { AddCollaboratorForm } from "../../AddCollaboratorForm";

export default async function ProjectsSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const myProjects = await db.project.findMany({
    where: { ownerId: currentUser.id },
    orderBy: { createdAt: "desc" },
    include: {
      collaborators: { include: { user: { include: { username: true } } } },
      skills: { select: { skillId: true } },
    },
  });
  const mySkills = await db.skill.findMany({
    where: { profile: { userId: currentUser.id } },
    orderBy: { position: "asc" },
  });

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Projects</h2>
      {myProjects.length === 0 && <p className="mutedText">No projects yet.</p>}
      {myProjects.map((project) => (
        <div key={project.id} id={`project-${project.id}`} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem", marginBottom: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              <strong>{project.title}</strong>{" "}
              <span className="mutedText">
                {project.status} · {project.visibility}
              </span>
            </span>
            <span style={{ display: "flex", gap: "0.35rem" }}>
              <Link href={`/p/${project.slug}`} className="button buttonSecondary buttonSmall">View</Link>
              {project.status !== "archived" && (
                <form action={archiveProject}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <button type="submit" className="button buttonSecondary buttonSmall">Archive</button>
                </form>
              )}
            </span>
          </div>
          {project.collaborators.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {project.collaborators.map((c) => (
                <span key={c.id} className="mutedText" style={{ fontSize: "0.8rem" }}>
                  {c.user?.username?.handle ?? c.displayName}
                  {c.role && ` (${c.role})`}
                  <form action={removeCollaborator} style={{ display: "inline" }}>
                    <input type="hidden" name="collaboratorId" value={c.id} />
                    <button type="submit" className="button buttonSecondary iconButton" style={{ marginLeft: "0.2rem" }} aria-label="Remove collaborator">✕</button>
                  </form>
                </span>
              ))}
            </div>
          )}
          <details className="profileEditToggle">
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Add collaborator</summary>
            <div style={{ marginTop: "0.5rem" }}>
              <AddCollaboratorForm projectId={project.id} />
            </div>
          </details>
          <details className="profileEditToggle">
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Edit details</summary>
            <div style={{ marginTop: "0.5rem" }}>
              <ProjectForm
                project={{ ...project, skillIds: project.skills.map((s) => s.skillId) }}
                ownSkills={mySkills.map((s) => ({ id: s.id, name: s.name }))}
              />
            </div>
          </details>
        </div>
      ))}
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Create a project</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <ProjectForm ownSkills={mySkills.map((s) => ({ id: s.id, name: s.name }))} />
        </div>
      </details>
    </div>
  );
}
