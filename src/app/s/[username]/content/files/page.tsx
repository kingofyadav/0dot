import Link from "next/link";
import { redirect } from "next/navigation";
import { File as FileIcon, Pencil, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deletePublishedFile } from "@/app/actions/published-files";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PublishedFileForm } from "../../PublishedFileForm";

export default async function FilesSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!currentUser.profile) redirect("/claim-username");

  const myFiles = await db.publishedFile.findMany({
    where: { profileId: currentUser.profile.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Files</h2>
      {myFiles.length === 0 && <EmptyState message="No files yet." />}
      {myFiles.map((file) => (
        <div key={file.id} id={`file-${file.id}`} className="settingsGroup" style={{ marginBottom: "var(--space-3)" }}>
          <SettingsRow
            icon={FileIcon}
            label={file.title}
            description={`${file.visibility} · ${file.downloadCount} downloads`}
            trailing={
              <>
                {currentUser.username && (
                  <Link href={`/${currentUser.username.handle}/files/${file.slug}`} className="button buttonSecondary buttonSmall">View</Link>
                )}
                <form action={deletePublishedFile}>
                  <input type="hidden" name="fileId" value={file.id} />
                  <ConfirmButton
                    className="button buttonSecondary buttonSmall"
                    title="Delete this file?"
                    description="This can't be undone."
                    confirmLabel="Delete"
                  >
                    Delete
                  </ConfirmButton>
                </form>
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
              <PublishedFileForm file={file} />
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
            <span className="settingsRowLabel">Publish a file</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <PublishedFileForm />
        </div>
      </details>
    </div>
  );
}
