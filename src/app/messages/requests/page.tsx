import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import {
  listMessageRequests,
  getConversationDisplayInfo,
  parseConversationCursor,
} from "@/lib/messaging";
import { isUserOnline } from "@/lib/presence";
import { acceptMessageRequest, declineMessageRequest } from "@/app/actions/messages";
import { Logo } from "@/components/Logo";
import { PresenceDot } from "@/components/PresenceDot";

// Separate from the primary inbox by design (spec §5.2/§5.8): a DM from a
// non-mutual, non-followed sender lands here, not in /messages, until
// accepted or declined. Not reusing ConversationListItem's whole-row <Link>
// here — Accept/Decline need their own <form>s, and interactive content
// (buttons) nested inside an <a> is invalid HTML, so this page renders its
// own row shape instead.
export default async function MessageRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const { cursor: rawCursor } = await searchParams;
  const cursor = parseConversationCursor(rawCursor);

  const { items: requests, nextCursor } = await listMessageRequests(currentUser.id, cursor);

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Message requests</h1>
        <Link href="/messages" className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to messages
        </Link>
      </div>

      <div className="conversationList">
        {requests.length === 0 && <p className="mutedText">No pending requests.</p>}
        {requests.map((conversation) => {
          const display = getConversationDisplayInfo(conversation, currentUser.id);
          return (
            <div
              key={conversation.id}
              className="profileLinkItem"
              style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.6rem" }}
            >
              <Link
                href={`/messages/${conversation.id}`}
                style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}
              >
                <span style={{ position: "relative", flexShrink: 0, display: "inline-flex" }}>
                  {display.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
                    <img
                      src={display.avatarUrl}
                      alt=""
                      width={40}
                      height={40}
                      style={{ borderRadius: "50%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ display: "inline-flex", borderRadius: "50%" }}>
                      <Logo size={40} />
                    </span>
                  )}
                  <PresenceDot online={display.otherUserId ? isUserOnline(display.otherUserId) : false} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600, display: "block" }}>
                    {display.title}
                    {display.handle && (
                      <span className="verifiedBadge" aria-label="View public profile" title="View public profile">
                        ✓
                      </span>
                    )}
                  </span>
                  <span className="mutedText" style={{ display: "block" }}>
                    {conversation.lastMessagePreview}
                  </span>
                </span>
              </Link>
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                <form action={acceptMessageRequest}>
                  <input type="hidden" name="conversationId" value={conversation.id} />
                  <button type="submit" className="button" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
                    Accept
                  </button>
                </form>
                <form action={declineMessageRequest}>
                  <input type="hidden" name="conversationId" value={conversation.id} />
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
          );
        })}
      </div>

      {nextCursor && (
        <Link
          href={`/messages/requests?cursor=${encodeURIComponent(nextCursor)}`}
          className="button buttonSecondary loadMoreLink"
        >
          Load more
        </Link>
      )}
    </div>
  );
}
