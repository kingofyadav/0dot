import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export default async function AuthorBooksPage({ params }: { params: Promise<{ username: string }> }) {
  const { username: rawParam } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username?.user.profile) notFound();

  const books = await db.book.findMany({
    where: { profileId: username.user.profile.id, status: "published", visibility: "public" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="profileCard">
      <Link href={`/${handle}`} className="mutedText" style={{ fontSize: "0.85rem" }}>
        ← {username.user.profile.displayName ?? handle}
      </Link>
      <h1 style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.6rem" }}>Books</h1>

      {books.length === 0 && <p className="mutedText" style={{ marginTop: "0.5rem" }}>No published books yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
        {books.map((book) => (
          <Link key={book.id} href={`/${handle}/books/${book.slug}`} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.15rem" }}>
            <strong>{book.title}</strong>
            {book.description && <span className="mutedText">{book.description}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
