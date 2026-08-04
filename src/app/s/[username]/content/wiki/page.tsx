import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { listAllProfileWikiPages } from "@/lib/wiki";
import { deleteProfileWikiPage } from "@/app/actions/knowledge-pages";
import { WikiPageForm } from "../../WikiPageForm";

const KIND_LABEL: Record<string, string> = { wiki: "Wiki page", documentation: "Documentation" };

export default async function WikiSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!currentUser.profile) redirect("/claim-username");

  const pages = await listAllProfileWikiPages(currentUser.profile.id);
  const pagesWithBody = await db.wikiPage.findMany({
    where: { profileId: currentUser.profile.id },
    include: { currentRevision: { select: { body: true } } },
  });
  const bodyById = new Map(pagesWithBody.map((p) => [p.id, p.currentRevision?.body ?? ""]));

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Wiki &amp; Documentation</h2>
      {pages.length === 0 && <p className="mutedText">No pages yet.</p>}
      {pages.map((page) => (
        <div key={page.id} id={`wiki-${page.id}`} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem", marginBottom: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              <strong>{page.title}</strong>{" "}
              <span className="mutedText">
                {KIND_LABEL[page.kind]} · {page.visibility}
                {page.parentPageId && " · sub-page"}
              </span>
            </span>
            <span style={{ display: "flex", gap: "0.35rem" }}>
              {currentUser.username && (
                <Link href={`/${currentUser.username.handle}/wiki/${page.slug}`} className="button buttonSecondary buttonSmall">View</Link>
              )}
              <form action={deleteProfileWikiPage}>
                <input type="hidden" name="pageId" value={page.id} />
                <button type="submit" className="button buttonSecondary buttonSmall">Delete</button>
              </form>
            </span>
          </div>
          <details className="profileEditToggle">
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Edit details</summary>
            <div style={{ marginTop: "0.5rem" }}>
              <WikiPageForm
                page={{ ...page, body: bodyById.get(page.id) ?? "", visibility: page.visibility ?? "public" }}
                otherPages={pages.map((p) => ({ id: p.id, title: p.title }))}
              />
            </div>
          </details>
        </div>
      ))}
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Write a page</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <WikiPageForm otherPages={pages.map((p) => ({ id: p.id, title: p.title }))} />
        </div>
      </details>
    </div>
  );
}
