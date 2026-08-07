import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { hasTierAccess } from "@/lib/tier-access";
import { LivestreamChatView } from "@/components/LivestreamChatView";
import { LivestreamBroadcaster } from "@/components/LivestreamBroadcaster";
import { LivestreamPlayer } from "@/components/LivestreamPlayer";
import { startLivestream, endLivestream } from "@/app/actions/livestreams";

const chatSenderInclude = { username: true, profile: true } as const;

// spec §8.3: a viewer only ever gets a LiveKit join token if they
// currently pass hasTierAccess — re-checked here at render time (via
// LivestreamPlayer -> requestViewerToken), not cached from any earlier
// state. This is the access-control boundary spec §8.3 asks for; whether
// video actually plays depends on livestream-provider.ts having real
// LiveKit credentials configured (falls back to the stub placeholder
// otherwise).
export default async function LivestreamPage({ params }: { params: Promise<{ livestreamId: string }> }) {
  const { livestreamId } = await params;

  const livestream = await db.livestream.findUnique({
    where: { id: livestreamId },
    include: { creator: { include: { username: true, profile: true } }, requiredTier: { select: { name: true } } },
  });
  if (!livestream) notFound();

  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === livestream.creatorId;
  const hasAccess = livestream.requiredTierId
    ? isOwner || (await hasTierAccess(currentUser?.id ?? null, livestream.creatorId, livestream.requiredTierId))
    : true;

  // Most-recent-200, not oldest-200 (orderBy desc + take, then reverse for
  // display) — same posture as community-chat.ts's getRecentChatMessages.
  // "asc + take 200" with no cursor would return the same fixed oldest
  // slice on every fetch: once a stream passed 200 chat messages, every
  // later message would be written to the DB and broadcast over SSE but
  // never actually appear here, since this exact query never advances.
  const recentMessages = hasAccess
    ? await db.livestreamChatMessage.findMany({
        where: { livestreamId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { sender: { include: chatSenderInclude } },
      })
    : [];
  const messages = [...recentMessages].reverse();

  const creatorName = livestream.creator.profile?.displayName ?? livestream.creator.username?.handle ?? "Unknown";

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{livestream.title}</h1>
          <p className="mutedText" style={{ fontSize: "0.85rem" }}>
            {livestream.creator.username ? (
              <Link href={`/${livestream.creator.username.handle}`}>{creatorName}</Link>
            ) : (
              creatorName
            )}
            {" · "}
            {livestream.status}
            {livestream.requiredTierId && livestream.requiredTier && ` · ${livestream.requiredTier.name}+ only`}
          </p>
        </div>
        {isOwner && livestream.status === "scheduled" && (
          <form action={startLivestream}>
            <input type="hidden" name="livestreamId" value={livestream.id} />
            <button type="submit" className="button buttonSmall">Go live</button>
          </form>
        )}
        {isOwner && livestream.status === "live" && (
          <form action={endLivestream}>
            <input type="hidden" name="livestreamId" value={livestream.id} />
            <button type="submit" className="button buttonSecondary buttonSmall">End stream</button>
          </form>
        )}
      </div>

      {!hasAccess ? (
        <p className="mutedText" style={{ marginTop: "1rem" }}>
          Subscribe to {livestream.requiredTier?.name ?? "a qualifying tier"} to watch this livestream.
        </p>
      ) : livestream.status !== "live" ? (
        <p className="mutedText" style={{ marginTop: "1rem" }}>
          {livestream.status === "scheduled" ? "This livestream hasn't started yet." : "This livestream has ended."}
        </p>
      ) : (
        <>
          <div style={{ marginTop: "1rem" }}>
            {isOwner ? (
              <LivestreamBroadcaster livestreamId={livestream.id} />
            ) : (
              <LivestreamPlayer livestreamId={livestream.id} />
            )}
          </div>
          <div style={{ marginTop: "1rem" }}>
            <LivestreamChatView
              livestreamId={livestream.id}
              currentUserId={currentUser?.id}
              messages={messages}
              canSend={!!currentUser}
              canModerate={isOwner}
            />
          </div>
        </>
      )}
    </div>
  );
}
