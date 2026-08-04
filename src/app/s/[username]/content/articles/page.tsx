import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteArticle } from "@/app/actions/articles";
import { ArticleForm } from "../../ArticleForm";

const FORMAT_LABEL: Record<string, string> = { article: "Article", tutorial: "Tutorial", note: "Note" };

export default async function ArticlesSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const myArticles = await db.article.findMany({
    where: { authorId: currentUser.id },
    orderBy: { createdAt: "desc" },
    include: { hashtags: { include: { hashtag: true } } },
  });

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Articles</h2>
      {myArticles.length === 0 && <p className="mutedText">No articles yet.</p>}
      {myArticles.map((article) => (
        <div key={article.id} id={`article-${article.id}`} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem", marginBottom: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              <strong>{article.title}</strong>{" "}
              <span className="mutedText">
                {FORMAT_LABEL[article.format]} · {article.status} · {article.visibility}
              </span>
            </span>
            <span style={{ display: "flex", gap: "0.35rem" }}>
              {currentUser.username && (
                <Link href={`/${currentUser.username.handle}/articles/${article.slug}`} className="button buttonSecondary buttonSmall">
                  View
                </Link>
              )}
              <form action={deleteArticle}>
                <input type="hidden" name="articleId" value={article.id} />
                <button type="submit" className="button buttonSecondary buttonSmall">Delete</button>
              </form>
            </span>
          </div>
          <details className="profileEditToggle">
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Edit details</summary>
            <div style={{ marginTop: "0.5rem" }}>
              <ArticleForm article={{ ...article, tags: article.hashtags.map((h) => h.hashtag.name) }} />
            </div>
          </details>
        </div>
      ))}
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Write an article</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <ArticleForm />
        </div>
      </details>
    </div>
  );
}
