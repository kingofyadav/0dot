import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getCommunityMember } from "@/lib/communities";
import { isGatedFromCommunityContent } from "@/lib/organizations";
import { listWikiPages } from "@/lib/wiki";

// Public listing, same visibility posture as the community feed (spec
// §3.1/§17.1: private communities gate content to members).
export default async function WikiListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const community = await db.community.findUnique({ where: { slug } });
  if (!community) notFound();

  const currentUser = await getCurrentUser();
  const membership = currentUser ? await getCommunityMember(community.id, currentUser.id) : null;
  const isActiveMember = membership?.status === "active" || membership?.status === "muted";
  if (isGatedFromCommunityContent(community, isActiveMember)) {
    return (
      <div className="profileCard">
        <p className="mutedText">This is a private community. Join to see its wiki.</p>
      </div>
    );
  }

  const pages = await listWikiPages(community.id);

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{community.name} wiki</h1>
        <span style={{ display: "flex", gap: "0.5rem" }}>
          <Link href={`/c/${community.slug}`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            Back to community
          </Link>
          {isActiveMember && (
            <Link href={`/c/${community.slug}/wiki/new`} className="button" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
              New page
            </Link>
          )}
        </span>
      </div>

      {pages.length === 0 && <p className="mutedText">No wiki pages yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {pages.map((page) => (
          <Link key={page.id} href={`/c/${community.slug}/wiki/${page.slug}`} className="profileLinkItem">
            {page.title}
          </Link>
        ))}
      </div>
    </div>
  );
}
