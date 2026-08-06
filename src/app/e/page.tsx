import Link from "next/link";
import { listUpcomingEvents } from "@/lib/events";
import { Logo } from "@/components/Logo";
import { EmptyState } from "@/components/EmptyState";

function hostLabel(event: Awaited<ReturnType<typeof listUpcomingEvents>>[number]): string {
  if (event.hostedByBusiness) return event.hostedByBusiness.name;
  if (event.hostedByCommunity) return event.hostedByCommunity.name;
  return event.hostedByUser?.profile?.displayName ?? event.hostedByUser?.username?.handle ?? "Unknown host";
}

function formatWhen(startsAt: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(startsAt);
}

// spec §9.1: this index shares listUpcomingEvents (src/lib/events.ts) with
// the search tab's default view — same "published, not yet ended,
// soonest-first" query, no engagement-based ranking (the deliberate
// departure from every other content-type listing in this codebase, see
// that lib's comment).
export default async function EventsIndexPage() {
  const events = await listUpcomingEvents(30);

  return (
    <div className="profileCard">
      <div className="pageHeaderRow">
        <h1 className="pageHeading">Events</h1>
        <Link href="/e/new" className="button buttonSmall">
          Host an event
        </Link>
      </div>

      {events.length === 0 && <EmptyState message="No upcoming events yet." />}

      <div className="itemStack">
        {events.map((event) => (
          <Link key={event.id} href={`/e/${event.slug}`} className="profileLinkItem mediaListItem">
            <span className="mediaListItemLead">
              {event.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
                <img src={event.coverImageUrl} alt="" width={40} height={40} style={{ borderRadius: "8px", objectFit: "cover" }} />
              ) : (
                <Logo size={40} />
              )}
              <span className="mediaListItemTitle">
                <strong>{event.title}</strong>
                <span className="mutedText" style={{ fontSize: "var(--text-xs)" }}>
                  {hostLabel(event)}
                </span>
              </span>
            </span>
            <span className="mutedText mediaListItemMeta" style={{ fontSize: "var(--text-sm)" }}>
              {formatWhen(event.startsAt)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
