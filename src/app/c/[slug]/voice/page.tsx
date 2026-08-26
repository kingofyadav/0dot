import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getCommunityMember } from "@/lib/communities";
import { isGatedFromCommunityContent } from "@/lib/organizations";
import { listVoiceRooms } from "@/lib/voice-rooms";
import { EmptyState } from "@/components/EmptyState";

const STATUS_LABEL: Record<string, string> = {
  live: "🔴 Live",
  scheduled: "Scheduled",
};

// Public listing, same visibility posture as the community feed/wiki/chat
// (spec §3.1/§17.1: private communities gate content to members).
export default async function VoiceRoomListPage({ params }: { params: Promise<{ slug: string }> }) {
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
        <p className="mutedText">This is a private community. Join to see its voice rooms.</p>
      </div>
    );
  }

  const rooms = await listVoiceRooms(community.id);

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{community.name} voice rooms</h1>
        <span style={{ display: "flex", gap: "0.5rem" }}>
          <Link href={`/c/${community.slug}`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            Back to community
          </Link>
          {isActiveMember && (
            <Link href={`/c/${community.slug}/voice/new`} className="button" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
              Start a room
            </Link>
          )}
        </span>
      </div>

      {rooms.length === 0 && <EmptyState message="No voice rooms right now." />}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {rooms.map((room) => {
          const creatorName = room.creator.profile?.displayName ?? room.creator.username?.handle ?? "Unknown";
          return (
            <Link
              key={room.id}
              href={`/c/${community.slug}/voice/${room.id}`}
              className="profileLinkItem"
              style={{ flexDirection: "column", alignItems: "stretch", gap: "0.2rem" }}
            >
              <span>{room.title}</span>
              <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                {STATUS_LABEL[room.status] ?? room.status} · started by {creatorName}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
