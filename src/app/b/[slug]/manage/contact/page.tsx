import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isBusinessStaff } from "@/lib/businesses";
import { markContactMessageRead, archiveContactMessage } from "@/app/actions/business-contact";
import { EmptyState } from "@/components/EmptyState";

function relativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// admin+-tier inbox (spec §6.1: "visible to admin+ team members as a
// queue") — status transitions only, no reply-in-app.
export default async function BusinessContactInboxPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const business = await db.business.findUnique({ where: { slug } });
  if (!business) notFound();

  if (!(await isBusinessStaff(business.id, currentUser.id))) {
    redirect(`/b/${business.slug}`);
  }

  const messages = await db.contactMessage.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    include: { senderUser: { include: { username: true, profile: true } } },
  });
  const newMessages = messages.filter((m) => m.status === "new");
  const readMessages = messages.filter((m) => m.status === "read");
  const archivedMessages = messages.filter((m) => m.status === "archived");

  function senderLabel(m: (typeof messages)[number]) {
    if (m.senderUser) {
      return m.senderUser.profile?.displayName ?? m.senderUser.username?.handle ?? "Unknown";
    }
    return `${m.senderName} (${m.senderEmail})`;
  }

  function MessageRow({ message }: { message: (typeof messages)[number] }) {
    return (
      <div className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.4rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <span>
            <strong>{senderLabel(message)}</strong>{" "}
            <span className="mutedText" style={{ fontSize: "0.8rem" }}>
              {relativeTime(message.createdAt)}
            </span>
          </span>
          <span style={{ display: "flex", gap: "0.4rem" }}>
            {message.status === "new" && (
              <form action={markContactMessageRead}>
                <input type="hidden" name="messageId" value={message.id} />
                <button type="submit" className="button buttonSecondary buttonSmall">
                  Mark read
                </button>
              </form>
            )}
            {message.status !== "archived" && (
              <form action={archiveContactMessage}>
                <input type="hidden" name="messageId" value={message.id} />
                <button type="submit" className="button buttonSecondary buttonSmall">
                  Archive
                </button>
              </form>
            )}
          </span>
        </div>
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{message.body}</p>
      </div>
    );
  }

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Contact messages — {business.name}</h1>
        <Link href={`/b/${business.slug}/manage`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to manage
        </Link>
      </div>

      {messages.length === 0 && <EmptyState message="No messages yet." />}

      {newMessages.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="sectionHeading">New ({newMessages.length})</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {newMessages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}
          </div>
        </div>
      )}

      {readMessages.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="sectionHeading">Read ({readMessages.length})</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {readMessages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}
          </div>
        </div>
      )}

      {archivedMessages.length > 0 && (
        <details className="profileEditToggle">
          <summary className="sectionHeading" style={{ cursor: "pointer" }}>
            Archived ({archivedMessages.length})
          </summary>
          <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {archivedMessages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
