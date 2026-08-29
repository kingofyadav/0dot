import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Pencil, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteArticle } from "@/app/actions/articles";
import { setContentLicense } from "@/app/actions/licenses";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ArticleForm } from "../../ArticleForm";

export const metadata: Metadata = { title: "Articles" };

const FORMAT_LABEL: Record<string, string> = { article: "Article", tutorial: "Tutorial", note: "Note" };

// phase-13 spec §5.1: all_rights_reserved (standard copyright, no row
// needed) is the default — this dropdown only ever declares *more*
// permissive terms, never removes rights an author hasn't opted to grant.
const LICENSE_LABELS: Record<string, string> = {
  all_rights_reserved: "All rights reserved (default)",
  cc_by: "CC BY",
  cc_by_sa: "CC BY-SA",
  cc_by_nc: "CC BY-NC",
  cc_by_nd: "CC BY-ND",
  cc0: "CC0 (public domain)",
};

export default async function ArticlesSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const myArticles = await db.article.findMany({
    where: { authorId: currentUser.id },
    orderBy: { createdAt: "desc" },
    include: { hashtags: { include: { hashtag: true } } },
  });
  const licenses = await db.contentLicense.findMany({
    where: { subjectType: "article", subjectId: { in: myArticles.map((a) => a.id) } },
  });
  const licenseByArticleId = new Map(licenses.map((l) => [l.subjectId, l.licenseType]));

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Articles</h2>
      {myArticles.length === 0 && <EmptyState message="No articles yet." />}
      {myArticles.map((article) => (
        <div key={article.id} id={`article-${article.id}`} className="settingsGroup" style={{ marginBottom: "var(--space-3)" }}>
          <SettingsRow
            icon={FileText}
            label={article.title}
            description={`${FORMAT_LABEL[article.format]} · ${article.status} · ${article.visibility}`}
            trailing={
              <>
                {currentUser.username && (
                  <Link href={`/${currentUser.username.handle}/articles/${article.slug}`} className="button buttonSecondary buttonSmall">
                    View
                  </Link>
                )}
                <form action={deleteArticle}>
                  <input type="hidden" name="articleId" value={article.id} />
                  <ConfirmButton
                    className="button buttonSecondary buttonSmall"
                    title="Delete this article?"
                    description="This can't be undone."
                    confirmLabel="Delete"
                  >
                    Delete
                  </ConfirmButton>
                </form>
              </>
            }
          />
          <form action={setContentLicense} style={{ display: "flex", gap: "0.35rem", alignItems: "center", padding: "0 var(--space-4) var(--space-3)" }}>
            <input type="hidden" name="subjectType" value="article" />
            <input type="hidden" name="subjectId" value={article.id} />
            <label className="mutedText" style={{ fontSize: "0.8rem" }} htmlFor={`license-${article.id}`}>
              License
            </label>
            <select
              id={`license-${article.id}`}
              name="licenseType"
              defaultValue={licenseByArticleId.get(article.id) ?? "all_rights_reserved"}
              className="textInput"
              style={{ fontSize: "0.8rem", padding: "0.2rem 0.4rem" }}
            >
              {Object.entries(LICENSE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button type="submit" className="button buttonSecondary buttonSmall">Save</button>
          </form>
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
              <ArticleForm article={{ ...article, tags: article.hashtags.map((h) => h.hashtag.name) }} />
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
            <span className="settingsRowLabel">Write an article</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <ArticleForm />
        </div>
      </details>
    </div>
  );
}
