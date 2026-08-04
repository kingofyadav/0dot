import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

const FORMAT_LABEL: Record<string, string> = { article: "Article", tutorial: "Tutorial", note: "Note" };

// spec §3.2/§8: public listing surface — always public+published only,
// regardless of viewer (unlisted is direct-link-only per spec §3.4's
// acceptance criterion, private never appears here at all; the owner's own
// full list, drafts included, lives at /s/{handle}/content/articles).
export default async function AuthorArticlesPage({ params }: { params: Promise<{ username: string }> }) {
  const { username: rawParam } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username) notFound();

  const articles = await db.article.findMany({
    where: { authorId: username.userId, status: "published", visibility: "public" },
    orderBy: { publishedAt: "desc" },
  });

  return (
    <div className="profileCard">
      <Link href={`/${handle}`} className="mutedText" style={{ fontSize: "0.85rem" }}>
        ← {username.user.profile?.displayName ?? handle}
      </Link>
      <h1 style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.6rem" }}>Articles</h1>

      {articles.length === 0 && <p className="mutedText" style={{ marginTop: "0.5rem" }}>No published articles yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
        {articles.map((article) => (
          <Link key={article.id} href={`/${handle}/articles/${article.slug}`} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.15rem" }}>
            <strong>{article.title}</strong>
            {article.subtitle && <span className="mutedText">{article.subtitle}</span>}
            <span className="mutedText" style={{ fontSize: "0.8rem" }}>
              {FORMAT_LABEL[article.format]} · {article.readingTimeMinutes} min read
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
