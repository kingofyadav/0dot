import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getEventBySlug, isEventHost, getMyRSVP, getRSVPCounts, listAttendees } from "@/lib/events";
import { getBusinessPayoutAccount } from "@/lib/payments";
import { renderWikiMarkdown } from "@/lib/wiki-markdown";
import { EngagementSection } from "@/components/EngagementSection";
import { EventActions } from "./EventActions";
import { EventHostPanel } from "./EventHostPanel";

const FORMAT_LABEL: Record<string, string> = { in_person: "In person", virtual: "Virtual", hybrid: "Hybrid" };

function hostLabel(event: NonNullable<Awaited<ReturnType<typeof getEventBySlug>>>): { label: string; href: string | null } {
  if (event.hostedByBusiness) return { label: event.hostedByBusiness.name, href: `/b/${event.hostedByBusiness.slug}` };
  if (event.hostedByCommunity) return { label: event.hostedByCommunity.name, href: `/c/${event.hostedByCommunity.slug}` };
  const handle = event.hostedByUser?.username?.handle ?? null;
  return { label: event.hostedByUser?.profile?.displayName ?? handle ?? "Unknown host", href: handle ? `/${handle}` : null };
}

function formatWhen(startsAt: Date, endsAt: Date | null, timezone: string): string {
  const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  return endsAt ? `${fmt.format(startsAt)} – ${fmt.format(endsAt)} (${timezone})` : `${fmt.format(startsAt)} (${timezone})`;
}

// input[type=datetime-local] wants "YYYY-MM-DDTHH:mm" in local time.
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const event = await getEventBySlug(slug);
  if (!event) notFound();

  const currentUser = await getCurrentUser();
  const isHost = currentUser ? await isEventHost(event, currentUser.id) : false;

  // spec §3.4: a draft event is visible only to its host/creator.
  if (event.status === "draft" && !isHost) notFound();

  const [rsvpCounts, myRSVP, myTickets, comments, isLiked, likeCount, businessPayoutAccount] = await Promise.all([
    getRSVPCounts(event.id),
    currentUser ? getMyRSVP(event.id, currentUser.id) : null,
    currentUser
      ? db.ticket.findMany({
          where: { ownerId: currentUser.id, ticketType: { eventId: event.id } },
          include: { ticketType: true },
          orderBy: { createdAt: "desc" },
        })
      : [],
    db.comment.findMany({
      where: { subjectType: "event", subjectId: event.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { author: { include: { username: true, profile: true } } },
    }),
    currentUser
      ? db.reaction.findUnique({ where: { subjectType_subjectId_userId: { subjectType: "event", subjectId: event.id, userId: currentUser.id } } })
      : null,
    db.reaction.count({ where: { subjectType: "event", subjectId: event.id } }),
    event.hostedByBusinessId ? getBusinessPayoutAccount(event.hostedByBusinessId) : null,
  ]);

  // spec §4.2/§9.2: attendee list visibility is per-event, and never leaked
  // to viewers it isn't meant for — host_only means only the host/creator
  // sees it, attendees_only additionally requires a `going` RSVP or ticket.
  const canSeeAttendees =
    event.attendeeListVisibility === "public" ||
    isHost ||
    (event.attendeeListVisibility === "attendees_only" && (myRSVP?.status === "going" || myTickets.length > 0));
  const attendees = canSeeAttendees ? await listAttendees(event.id) : [];

  const host = hostLabel(event);

  return (
    <div>
      <div className="profileCard">
        {event.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
          <img src={event.coverImageUrl} alt="" style={{ width: "100%", maxHeight: 280, objectFit: "cover", borderRadius: "10px", marginBottom: "var(--space-4)" }} />
        )}

        {event.status === "cancelled" && <p className="errorText" style={{ marginBottom: "var(--space-2)" }}>This event has been cancelled.</p>}
        {event.status === "draft" && <p className="mutedText" style={{ marginBottom: "var(--space-2)" }}>Draft — only you can see this.</p>}

        <h1 className="eventTitle">{event.title}</h1>
        <div className="eventMeta">
          <p className="mutedText">
            Hosted by {host.href ? <Link href={host.href}>{host.label}</Link> : host.label}
          </p>
          <p className="mutedText" style={{ fontSize: "var(--text-sm)" }}>
            {formatWhen(event.startsAt, event.endsAt, event.timezone)}
          </p>
          <p className="mutedText" style={{ fontSize: "var(--text-sm)" }}>
            {FORMAT_LABEL[event.format]}
            {event.location && ` · ${event.location}`}
          </p>
          {event.virtualJoinUrl && (
            <p style={{ fontSize: "var(--text-sm)" }}>
              <a href={event.virtualJoinUrl} target="_blank" rel="noopener noreferrer">
                Join link
              </a>
            </p>
          )}
          <p className="mutedText" style={{ fontSize: "var(--text-xs)" }}>
            {rsvpCounts.going} going · {rsvpCounts.interested} interested
            {event.capacity !== null && ` · capacity ${event.capacity}`}
          </p>
        </div>

        {event.description && <div style={{ marginTop: "var(--space-5)" }}>{renderWikiMarkdown(event.description)}</div>}

        {currentUser && event.status === "published" && (
          <EventActions
            eventId={event.id}
            currentRsvpStatus={myRSVP?.status ?? null}
            ticketTypes={event.ticketTypes}
            myTickets={myTickets.map((t) => ({ id: t.id, qrCodeToken: t.qrCodeToken, status: t.status, ticketTypeName: t.ticketType.name }))}
          />
        )}

        {canSeeAttendees && attendees.length > 0 && (
          <div style={{ marginTop: "var(--space-5)" }}>
            <p className="sectionHeading">Attendees</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {attendees.map((a) => (
                <span key={a.userId} className="profileLinkItem">
                  {a.user.profile?.displayName ?? a.user.username?.handle ?? "Someone"}
                </span>
              ))}
            </div>
          </div>
        )}

        <EngagementSection
          subjectType="event"
          subjectId={event.id}
          likeCount={likeCount}
          isLiked={Boolean(isLiked)}
          currentUserId={currentUser?.id ?? null}
          ownerId={event.createdBy}
          showCommentForm={Boolean(currentUser)}
          comments={comments.map((c) => ({
            id: c.id,
            body: c.body,
            authorId: c.authorId,
            authorName: c.author.profile?.displayName ?? c.author.username?.handle ?? "Unknown",
          }))}
        />
      </div>

      {isHost && (
        <EventHostPanel
          event={{
            id: event.id,
            title: event.title,
            description: event.description,
            format: event.format,
            location: event.location,
            virtualJoinUrl: event.virtualJoinUrl,
            timezone: event.timezone,
            capacity: event.capacity,
            attendeeListVisibility: event.attendeeListVisibility,
            startsAt: toDatetimeLocal(event.startsAt),
            endsAt: event.endsAt ? toDatetimeLocal(event.endsAt) : "",
            status: event.status,
          }}
          hostedByBusinessId={event.hostedByBusinessId}
          businessPayoutActive={businessPayoutAccount?.status === "active"}
        />
      )}
    </div>
  );
}
