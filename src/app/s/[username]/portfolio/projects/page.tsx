import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderGit2, Pencil, Plus, UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { archiveProject, removeCollaborator } from "@/app/actions/projects";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";
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
      {myProjects.length === 0 && <EmptyState message="No projects yet." />}
      {myProjects.map((project) => (
        <div key={project.id} id={`project-${project.id}`} className="settingsGroup" style={{ marginBottom: "var(--space-3)" }}>
          <SettingsRow
            icon={FolderGit2}
            label={project.title}
            description={`${project.status} · ${project.visibility}`}
            trailing={
              <>
                <Link href={`/p/${project.slug}`} className="button buttonSecondary buttonSmall">View</Link>
                {project.status !== "archived" && (
                  <form action={archiveProject}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <button type="submit" className="button buttonSecondary buttonSmall">Archive</button>
                  </form>
                )}
              </>
            }
          />
          {project.collaborators.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", padding: "0 var(--space-4) var(--space-3)" }}>
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
          <details>
            <summary className="settingsRow settingsAddTrigger">
              <span className="settingsRowIcon" aria-hidden="true">
                <UserPlus size={16} />
              </span>
              <span className="settingsRowText">
                <span className="settingsRowLabel">Add collaborator</span>
              </span>
            </summary>
            <div className="settingsAddPanelBody">
              <AddCollaboratorForm projectId={project.id} />
            </div>
          </details>
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
              <ProjectForm
                project={{ ...project, skillIds: project.skills.map((s) => s.skillId) }}
                ownSkills={mySkills.map((s) => ({ id: s.id, name: s.name }))}
              />
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
            <span className="settingsRowLabel">Create a project</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <ProjectForm ownSkills={mySkills.map((s) => ({ id: s.id, name: s.name }))} />
        </div>
      </details>
    </div>
  );
}
