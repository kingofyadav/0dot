import { redirect } from "next/navigation";
import { GitBranch, X } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteGitRepository } from "@/app/actions/git-repositories";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmButton } from "@/components/ConfirmButton";
import { GitRepositoryForm } from "../../GitRepositoryForm";

export default async function RepositoriesSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const [myGitRepositories, myProjects] = await Promise.all([
    db.gitRepository.findMany({ where: { profile: { userId: currentUser.id } } }),
    db.project.findMany({ where: { ownerId: currentUser.id }, select: { id: true, title: true } }),
  ]);

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Git repositories</h2>
      {myGitRepositories.length === 0 ? (
        <EmptyState message="No repositories yet." />
      ) : (
        <div className="settingsGroup">
          {myGitRepositories.map((repo) => (
            <SettingsRow
              key={repo.id}
              icon={GitBranch}
              label={
                <a href={repo.url} target="_blank" rel="noopener noreferrer">
                  {repo.displayName}
                </a>
              }
              description={[repo.primaryLanguage, repo.starCount !== null ? `★ ${repo.starCount}` : null].filter(Boolean).join(" · ") || undefined}
              trailing={
                <form action={deleteGitRepository}>
                  <input type="hidden" name="gitRepositoryId" value={repo.id} />
                  <ConfirmButton
                    className="button buttonSecondary iconButton"
                    title="Delete this repository?"
                    description="This can't be undone."
                    confirmLabel="Delete"
                    aria-label="Delete repository"
                  >
                    <X size={16} aria-hidden="true" />
                  </ConfirmButton>
                </form>
              }
            />
          ))}
        </div>
      )}
      <p className="settingsGroupLabel">Add a repository</p>
      <div className="settingsGroup">
        <div className="settingsAddPanelBody">
          <GitRepositoryForm ownProjects={myProjects.map((p) => ({ id: p.id, title: p.title }))} />
        </div>
      </div>
    </div>
  );
}
