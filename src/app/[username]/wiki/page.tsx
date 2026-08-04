import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { listProfileWikiPages } from "@/lib/wiki";

const KIND_LABEL: Record<string, string> = { wiki: "Wiki page", documentation: "Documentation" };

// Always visibility: public (unlisted is direct-link-only, private never
// appears) regardless of viewer — same posture Article's public listing
// uses (spec §3.4's acceptance criterion, reused for §5's personal wiki).
export default async function ProfileWikiListPage({ params }: { params: Promise<{ username: string }> }) {
  const { username: rawParam } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username?.user.profile) notFound();

  const allTopLevel = await listProfileWikiPages(username.user.profile.id);
  const pages = allTopLevel.filter((p) => p.visibility === "public");

  return (
    <div className="profileCard">
      <Link href={`/${handle}`} className="mutedText" style={{ fontSize: "0.85rem" }}>
        ← {username.user.profile.displayName ?? handle}
      </Link>
      <h1 style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "0.6rem" }}>Wiki &amp; Documentation</h1>

      {pages.length === 0 && <p className="mutedText" style={{ marginTop: "0.5rem" }}>No pages yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
        {pages.map((page) => (
          <Link key={page.id} href={`/${handle}/wiki/${page.slug}`} className="profileLinkItem">
            <strong>{page.title}</strong>
            <span className="mutedText" style={{ fontSize: "0.8rem" }}>{KIND_LABEL[page.kind]}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
