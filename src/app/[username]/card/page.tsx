import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getBusinessCard } from "@/lib/business-card";
import { getSocialPlatformLabel, type SocialPlatform } from "@/lib/theme-presets";

// spec §6.1: renders the same canonical profile identity Phase 1's QR code
// already resolves to — no second identity representation.
export default async function BusinessCardPage({ params }: { params: Promise<{ username: string }> }) {
  const { username: rawParam } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();

  const card = await getBusinessCard(handle);
  if (!card) {
    // getBusinessCard returns null both when the handle doesn't exist at all
    // and when it exists but hasn't enabled a card — a real 404 is only
    // correct for the former (live-site QA pass, 2026-08-25 flagged the
    // latter case reading as a broken link rather than "not set up yet").
    const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
    if (!username) notFound();

    return (
      <div className="profileCard">
        <Link href={`/${handle}`} className="mutedText" style={{ fontSize: "0.85rem" }}>
          ← {username.user.profile?.displayName ?? handle}
        </Link>
        <p className="mutedText" style={{ marginTop: "0.75rem" }}>
          {username.user.profile?.displayName ?? handle} hasn&apos;t set up a business card yet.
        </p>
      </div>
    );
  }

  return (
    <div className="profileCard">
      <Link href={`/${handle}`} className="mutedText" style={{ fontSize: "0.85rem" }}>
        ← {card.displayName}
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.75rem" }}>
        {card.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.avatarUrl} alt="" width={64} height={64} style={{ borderRadius: "50%" }} />
        )}
        <div>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 700 }}>{card.displayName}</h1>
          {card.workTitle && <p className="mutedText">{card.workTitle}</p>}
        </div>
      </div>

      {card.bio && <p style={{ marginTop: "1rem", whiteSpace: "pre-wrap" }}>{card.bio}</p>}

      {card.email && (
        <p style={{ marginTop: "0.75rem" }}>
          <a href={`mailto:${card.email}`}>{card.email}</a>
        </p>
      )}

      {card.socialLinks.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
          {card.socialLinks.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer nofollow" className="button buttonSecondary buttonSmall">
              {getSocialPlatformLabel(link.platform as SocialPlatform)}
            </a>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.6rem", marginTop: "1.25rem", alignItems: "center" }}>
        <a href={`/api/card/${handle}/vcard`} className="button" download>
          Save contact (.vcf)
        </a>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/qr/${handle}`} alt="QR code linking to this profile" width={72} height={72} />
      </div>
    </div>
  );
}
