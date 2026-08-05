import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getCommunityMember, isCommunityStaff } from "@/lib/communities";
import { isGatedFromCommunityContent } from "@/lib/organizations";
import { getVoiceRoom, getSpeakQueue, isFloorFree } from "@/lib/voice-rooms";
import { startVoiceRoom, endVoiceRoom } from "@/app/actions/voice-rooms";
import { VoiceRoomView } from "./VoiceRoomView";

export default async function VoiceRoomPage({
  params,
}: {
  params: Promise<{ slug: string; roomId: string }>;
}) {
  const { slug: rawSlug, roomId } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const community = await db.community.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, visibility: true, restrictedToOrganizationId: true },
  });
  if (!community) notFound();

  const room = await getVoiceRoom(roomId);
  if (!room || room.communityId !== community.id) notFound();

  const membership = await getCommunityMember(community.id, currentUser.id);
  const isActiveMember = membership?.status === "active" || membership?.status === "muted";
  if (isGatedFromCommunityContent(community, isActiveMember)) {
    return (
      <div className="profileCard">
        <p className="mutedText">This is a private community. Join to see its voice rooms.</p>
      </div>
    );
  }

  const myParticipant = room.participants.find((p) => p.userId === currentUser.id) ?? null;
  const canSpeak = membership?.status === "active";
  const isCreator = room.createdBy === currentUser.id;
  const isStaff = await isCommunityStaff(community.id, currentUser.id);

  const queue = getSpeakQueue(room.participants);
  const myQueueIndex = myParticipant?.role === "requesting_to_speak" ? queue.findIndex((p) => p.userId === currentUser.id) : -1;
  const isMyTurnNext = myQueueIndex === 0 && isFloorFree(room);

  const speakerName = room.currentSpeaker
    ? room.currentSpeaker.profile?.displayName ?? room.currentSpeaker.username?.handle ?? "Unknown"
    : null;

  return (
    <div className="profileCard">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Link href={`/c/${community.slug}/voice`} className="button buttonSecondary iconButton" aria-label="Back to voice rooms">
            ←
          </Link>
          <div>
            <h1 style={{ fontSize: "1.05rem", fontWeight: 700 }}>{room.title}</h1>
            <span className="mutedText" style={{ fontSize: "0.8rem" }}>
              {room.status === "live" ? "🔴 Live" : room.status === "scheduled" ? "Scheduled" : "Ended"}
            </span>
          </div>
        </div>
        <span style={{ display: "flex", gap: "0.5rem" }}>
          {room.status === "scheduled" && isCreator && (
            <form action={startVoiceRoom}>
              <input type="hidden" name="voiceRoomId" value={room.id} />
              <button type="submit" className="button" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
                Start room
              </button>
            </form>
          )}
          {room.status !== "ended" && (isCreator || isStaff) && (
            <form action={endVoiceRoom}>
              <input type="hidden" name="voiceRoomId" value={room.id} />
              <button type="submit" className="button buttonDanger" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
                End room
              </button>
            </form>
          )}
        </span>
      </div>

      {room.status === "ended" ? (
        <p className="mutedText">This room has ended.</p>
      ) : room.status === "scheduled" ? (
        <p className="mutedText">This room hasn&apos;t started yet.</p>
      ) : (
        <VoiceRoomView
          communitySlug={community.slug}
          roomId={room.id}
          currentUserId={currentUser.id}
          isParticipant={myParticipant !== null}
          myRole={myParticipant?.role ?? null}
          canSpeak={canSpeak}
          isStaff={isStaff}
          currentSpeakerId={room.currentSpeakerId}
          currentSpeakerName={speakerName}
          participants={room.participants.map((p) => ({
            userId: p.userId,
            role: p.role,
            displayName: p.user.profile?.displayName ?? p.user.username?.handle ?? "Unknown",
          }))}
          queuePosition={myQueueIndex >= 0 ? myQueueIndex + 1 : null}
          isMyTurnNext={isMyTurnNext}
        />
      )}
    </div>
  );
}
