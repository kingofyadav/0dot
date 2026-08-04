import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteGitRepository } from "@/app/actions/git-repositories";
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
      {myGitRepositories.length === 0 && <p className="mutedText">No repositories yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {myGitRepositories.map((repo) => (
          <div key={repo.id} className="profileLinkItem" style={{ justifyContent: "space-between" }}>
            <a href={repo.url} target="_blank" rel="noopener noreferrer">
              {repo.displayName}
              <span className="mutedText">
                {" "}
                {repo.primaryLanguage && `· ${repo.primaryLanguage}`} {repo.starCount !== null && `· ★ ${repo.starCount}`}
              </span>
            </a>
            <form action={deleteGitRepository}>
              <input type="hidden" name="gitRepositoryId" value={repo.id} />
              <button type="submit" className="button buttonSecondary iconButton" aria-label="Delete repository">✕</button>
            </form>
          </div>
        ))}
      </div>
      <div style={{ marginTop: "0.5rem" }}>
        <GitRepositoryForm ownProjects={myProjects.map((p) => ({ id: p.id, title: p.title }))} />
      </div>
    </div>
  );
}
