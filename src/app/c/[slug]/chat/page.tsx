import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getCommunityMember, isCommunityStaff } from "@/lib/communities";
import { getRecentChatMessages } from "@/lib/community-chat";
import { CommunityChatView } from "./CommunityChatView";

export default async function CommunityChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const community = await db.community.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, visibility: true },
  });
  if (!community) notFound();

  const currentUser = await getCurrentUser();
  const membership = currentUser ? await getCommunityMember(community.id, currentUser.id) : null;
  const isActiveMember = membership?.status === "active" || membership?.status === "muted";

  if (community.visibility === "private" && !isActiveMember) {
    return (
      <div className="profileCard">
        <p className="mutedText">This is a private community. Join to see its chat.</p>
      </div>
    );
  }

  const { items: recentMessages } = await getRecentChatMessages(community.id, null);
  const messages = [...recentMessages].reverse(); // oldest-first for chat display
  const canModerate = currentUser ? await isCommunityStaff(community.id, currentUser.id) : false;

  return (
    <div className="profileCard" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 8rem)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Link href={`/c/${community.slug}`} className="button buttonSecondary iconButton" aria-label="Back to community">
            ←
          </Link>
          <h1 style={{ fontSize: "1.05rem", fontWeight: 700 }}>{community.name} chat</h1>
        </div>
      </div>

      <CommunityChatView
        communitySlug={community.slug}
        communityId={community.id}
        currentUserId={currentUser?.id}
        messages={messages}
        canSend={membership?.status === "active"}
        canModerate={canModerate}
      />
    </div>
  );
}
