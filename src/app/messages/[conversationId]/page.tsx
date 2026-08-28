import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import {
  getParticipant,
  getConversationWithParticipants,
  getConversationDisplayInfo,
  getMessagesForConversation,
  getMessageableCandidates,
  markConversationRead,
} from "@/lib/messaging";
import { isUserOnline } from "@/lib/presence";
import { acceptMessageRequest, declineMessageRequest } from "@/app/actions/messages";
import { GroupParticipantsPanel } from "@/components/GroupParticipantsPanel";
import { Logo } from "@/components/Logo";
import { PresenceDot } from "@/components/PresenceDot";
import { PresenceStatus } from "@/components/PresenceStatus";
import { ConversationRowMenu } from "@/components/ConversationRowMenu";
import { ConversationView } from "./ConversationView";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const { conversationId } = await params;

  // spec §5.7/§5.8: a non-participant (including a guessed/enumerated ID)
  // must never be able to read this conversation — 404, same response
  // whether the conversation doesn't exist or the viewer just isn't in it,
  // so neither case leaks information the other wouldn't.
  const participant = await getParticipant(conversationId, currentUser.id);
  if (!participant) notFound();

  const conversation = await getConversationWithParticipants(conversationId, currentUser.id);
  if (!conversation) notFound();

  const display = getConversationDisplayInfo(conversation, currentUser.id);
  const isOtherOnline = display.otherUserId ? await isUserOnline(display.otherUserId) : false;
  const { items: recentMessages, nextCursor } = await getMessagesForConversation(conversationId, currentUser.id, null);
  const messages = [...recentMessages].reverse(); // oldest-first for chat display

  const requestState = conversation.requestState;
  const isPendingNotMine = requestState?.status === "pending" && requestState.initiatedBy !== currentUser.id;
  const isDeclined = requestState?.status === "declined";
  const canReply = !isDeclined && !isPendingNotMine;

  // Mark-as-read-on-view (same precedent as notifications/page.tsx: a direct
  // DB write inside a Server Component render, idempotent on re-render).
  await markConversationRead(conversationId, currentUser.id);

  const isGroup = conversation.kind === "group";
  let addCandidates: { userId: string; handle: string | null; displayName: string }[] = [];
  if (isGroup) {
    const existingIds = new Set(conversation.participants.map((p) => p.userId));
    const all = await getMessageableCandidates(currentUser.id);
    addCandidates = all.filter((c) => !existingIds.has(c.userId));
  }

  return (
    <div className="profileCard" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 8rem)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
          <Link href="/messages" className="button buttonSecondary iconButton" aria-label="Back to messages">
            <ArrowLeft size={16} aria-hidden="true" />
          </Link>
          {!isGroup && (
            <span style={{ position: "relative", flexShrink: 0, display: "inline-flex" }}>
              {display.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
                <img
                  src={display.avatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  style={{ borderRadius: "50%", objectFit: "cover" }}
                />
              ) : (
                <span style={{ display: "inline-flex", borderRadius: "50%" }}>
                  <Logo size={36} />
                </span>
              )}
              <PresenceDot online={isOtherOnline} />
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>
              {display.handle ? <Link href={`/${display.handle}`}>{display.title}</Link> : display.title}
              {display.handle && (
                <Link href={`/${display.handle}`} className="verifiedBadge" aria-label="View public profile" title="View public profile">
                  <BadgeCheck size={14} aria-hidden="true" />
                </Link>
              )}
            </h1>
            {!isGroup && display.otherLastActiveAt && (
              <PresenceStatus online={isOtherOnline} lastActiveAt={display.otherLastActiveAt} />
            )}
          </div>
        </div>
        <ConversationRowMenu conversationId={conversationId} />
      </div>

      {isGroup && (
        <GroupParticipantsPanel
          conversationId={conversationId}
          participants={conversation.participants.map((p) => ({
            userId: p.userId,
            role: p.role,
            displayName: p.user.profile?.displayName ?? "Unknown user",
            handle: p.user.username?.handle ?? null,
          }))}
          addCandidates={addCandidates}
          isViewerAdmin={participant.role === "admin"}
          viewerUserId={currentUser.id}
        />
      )}

      {isPendingNotMine && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginBottom: "0.75rem",
            padding: "0.6rem 0.85rem",
            borderRadius: "10px",
            border: "1px solid var(--border)",
          }}
        >
          <p className="mutedText" style={{ margin: 0 }}>
            This is a message request.
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <form action={acceptMessageRequest}>
              <input type="hidden" name="conversationId" value={conversationId} />
              <button type="submit" className="button" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
                Accept
              </button>
            </form>
            <form action={declineMessageRequest}>
              <input type="hidden" name="conversationId" value={conversationId} />
              <button
                type="submit"
                className="button buttonSecondary"
                style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}
              >
                Decline
              </button>
            </form>
          </div>
        </div>
      )}

      <ConversationView
        conversationId={conversationId}
        currentUserId={currentUser.id}
        initialMessages={messages}
        initialOlderCursor={nextCursor}
        canReply={canReply}
      />
    </div>
  );
}
