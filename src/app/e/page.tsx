import Link from "next/link";
import { listUpcomingEvents } from "@/lib/events";
import { Logo } from "@/components/Logo";

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Events</h1>
        <Link href="/e/new" className="button" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Host an event
        </Link>
      </div>

      {events.length === 0 && <p className="mutedText">No upcoming events yet.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {events.map((event) => (
          <Link key={event.id} href={`/e/${event.slug}`} className="profileLinkItem" style={{ justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              {event.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
                <img src={event.coverImageUrl} alt="" width={40} height={40} style={{ borderRadius: "8px", objectFit: "cover" }} />
              ) : (
                <Logo size={40} />
              )}
              <span style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 600 }}>{event.title}</span>
                <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                  {hostLabel(event)}
                </span>
              </span>
            </span>
            <span className="mutedText" style={{ fontSize: "0.85rem" }}>
              {formatWhen(event.startsAt)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
