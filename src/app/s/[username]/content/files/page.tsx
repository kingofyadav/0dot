import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deletePublishedFile } from "@/app/actions/published-files";
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
      {myFiles.length === 0 && <p className="mutedText">No files yet.</p>}
      {myFiles.map((file) => (
        <div key={file.id} id={`file-${file.id}`} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem", marginBottom: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              <strong>{file.title}</strong>{" "}
              <span className="mutedText">{file.visibility} · {file.downloadCount} downloads</span>
            </span>
            <span style={{ display: "flex", gap: "0.35rem" }}>
              {currentUser.username && (
                <Link href={`/${currentUser.username.handle}/files/${file.slug}`} className="button buttonSecondary buttonSmall">View</Link>
              )}
              <form action={deletePublishedFile}>
                <input type="hidden" name="fileId" value={file.id} />
                <button type="submit" className="button buttonSecondary buttonSmall">Delete</button>
              </form>
            </span>
          </div>
          <details className="profileEditToggle">
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Edit details</summary>
            <div style={{ marginTop: "0.5rem" }}>
              <PublishedFileForm file={file} />
            </div>
          </details>
        </div>
      ))}
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Publish a file</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <PublishedFileForm />
        </div>
      </details>
    </div>
  );
}
