import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getCommunityMember } from "@/lib/communities";
import { NewVoiceRoomForm } from "./NewVoiceRoomForm";

export default async function NewVoiceRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const community = await db.community.findUnique({ where: { slug }, select: { id: true, slug: true } });
  if (!community) notFound();

  const membership = await getCommunityMember(community.id, currentUser.id);
  if (!membership || membership.status !== "active") redirect(`/c/${community.slug}/voice`);

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Start a voice room</h1>
        <Link href={`/c/${community.slug}/voice`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Cancel
        </Link>
      </div>
      <NewVoiceRoomForm communityId={community.id} />
    </div>
  );
}
