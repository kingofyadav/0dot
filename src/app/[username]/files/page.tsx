import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export default async function AuthorFilesPage({ params }: { params: Promise<{ username: string }> }) {
  const { username: rawParam } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username?.user.profile) notFound();

  const files = await db.publishedFile.findMany({
    where: { profileId: username.user.profile.id, visibility: "public" },
    orderBy: { publishedAt: "desc" },
  });

  return (
    <div className="profileCard">
      <Link href={`/${handle}`} className="mutedText" style={{ fontSize: "0.85rem" }}>
        ← {username.user.profile.displayName ?? handle}
      </Link>
      <h1 style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.6rem" }}>Files</h1>

      {files.length === 0 && <p className="mutedText" style={{ marginTop: "0.5rem" }}>No published files yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
        {files.map((file) => (
          <Link key={file.id} href={`/${handle}/files/${file.slug}`} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.15rem" }}>
            <strong>{file.title}</strong>
            {file.description && <span className="mutedText">{file.description}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
