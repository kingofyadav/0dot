import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getCommunityMember, isCommunityStaff } from "@/lib/communities";
import { NewWikiPageForm } from "./NewWikiPageForm";

export default async function NewWikiPagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // spec §10.1: creation follows the same wikiEditPolicy as editing —
  // moderators-only by default, any active member if the community opted
  // into "members".
  const fullCommunity = await db.community.findUnique({
    where: { slug },
    select: { id: true, slug: true, wikiEditPolicy: true },
  });
  if (!fullCommunity) notFound();

  const canCreate =
    fullCommunity.wikiEditPolicy === "members"
      ? (await getCommunityMember(fullCommunity.id, currentUser.id))?.status === "active"
      : await isCommunityStaff(fullCommunity.id, currentUser.id);
  if (!canCreate) redirect(`/c/${fullCommunity.slug}/wiki`);

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>New wiki page</h1>
        <Link href={`/c/${fullCommunity.slug}/wiki`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Cancel
        </Link>
      </div>
      <NewWikiPageForm communityId={fullCommunity.id} />
    </div>
  );
}
