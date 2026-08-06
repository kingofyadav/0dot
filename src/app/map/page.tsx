import Link from "next/link";
import { db } from "@/lib/db";

type Pin = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  latitude: number;
  longitude: number;
};

function osmEmbedSrc(lat: number, lng: number): string {
  const delta = 0.01;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${lat},${lng}&layer=mapnik`;
}

// phase-16 spec §10.2: a live query over BusinessLocation and now-geo-tagged
// Event rows, no new backend entity beyond §10.1's Event.latitude/longitude
// fix — same aggregation-not-duplication principle as this doc's Calendar
// and Job board. No maps SDK dependency in this codebase, so each pin
// renders via a plain, key-free OpenStreetMap embed rather than a single
// JS map component.
export default async function MapPage() {
  const [locations, events] = await Promise.all([
    db.businessLocation.findMany({
      where: { latitude: { not: null }, longitude: { not: null }, business: { status: "active" } },
      include: { business: { select: { slug: true, name: true } } },
      take: 30,
    }),
    db.event.findMany({
      where: { latitude: { not: null }, longitude: { not: null }, status: "published", startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      take: 30,
    }),
  ]);

  const pins: Pin[] = [
    ...locations.map((loc) => ({
      id: `location:${loc.id}`,
      title: loc.business.name,
      subtitle: loc.label || loc.address,
      href: `/b/${loc.business.slug}`,
      latitude: loc.latitude!,
      longitude: loc.longitude!,
    })),
    ...events.map((event) => ({
      id: `event:${event.id}`,
      title: event.title,
      subtitle: event.startsAt.toLocaleDateString(),
      href: `/e/${event.slug}`,
      latitude: event.latitude!,
      longitude: event.longitude!,
    })),
  ];

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>Map</h1>
      {pins.length === 0 && <p className="mutedText">No geo-tagged businesses or events yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {pins.map((pin) => (
          <div key={pin.id}>
            <Link href={pin.href}>
              <strong>{pin.title}</strong>
            </Link>
            <p className="mutedText" style={{ margin: "0.1rem 0 0.5rem", fontSize: "0.85rem" }}>{pin.subtitle}</p>
            <iframe
              title={pin.title}
              src={osmEmbedSrc(pin.latitude, pin.longitude)}
              style={{ width: "100%", height: "220px", border: "1px solid var(--border)", borderRadius: "8px" }}
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
