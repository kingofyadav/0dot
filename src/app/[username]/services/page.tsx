import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getAvailableSlots } from "@/lib/appointments";
import { requestAppointment } from "@/app/actions/appointments";
import { OfferingBuyButton } from "@/components/OfferingBuyButton";
import { RequestSlotButton } from "@/components/RequestSlotButton";

const SLOT_WINDOW_DAYS = 14;

// phase-9 spec §3.1/§3.2: the public "self" mirror of /b/[slug]/store +
// /b/[slug]/appointments merged into one page — an individual seller's
// scale doesn't need the two-tab split a business catalog does. Native
// checkout for priced products, book-a-slot for bookable services, same
// underlying actions (purchaseOffering/requestAppointment) a business
// storefront uses.
export default async function UserServicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ offeringId?: string }>;
}) {
  const { username: rawParam } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();
  const { offeringId } = await searchParams;

  const username = await db.username.findUnique({ where: { handle }, include: { user: { include: { profile: true } } } });
  if (!username) notFound();

  const currentUser = await getCurrentUser();
  const isOwner = currentUser?.id === username.userId;

  const offerings = await db.offering.findMany({
    where: { sellerUserId: username.userId, ...(isOwner ? {} : { status: "active" }) },
    orderBy: { createdAt: "desc" },
  });
  if (offerings.length === 0 && !isOwner) notFound();

  const payoutAccount = await db.creatorPayoutAccount.findUnique({ where: { userId: username.userId } });
  const nativeCheckoutAvailable = payoutAccount?.status === "active";

  const bookableOfferings = offerings.filter((o) => o.isBookable);
  const selectedOffering = offeringId ? bookableOfferings.find((o) => o.id === offeringId) : undefined;
  const now = new Date();
  const slots = selectedOffering
    ? await getAvailableSlots(selectedOffering.id, { from: now, to: new Date(now.getTime() + SLOT_WINDOW_DAYS * 24 * 60 * 60 * 1000) })
    : [];

  const displayName = username.user.profile?.displayName ?? username.handle;

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{displayName} — Services</h1>
        <Link href={`/${username.handle}`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to profile
        </Link>
      </div>

      {offerings.length === 0 && <p className="mutedText">Nothing listed yet.</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {offerings.map((offering) => {
          const isPurchasable = offering.price !== null;
          return (
            <div key={offering.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.4rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <strong>{offering.name}</strong>
                <span className="mutedText" style={{ fontSize: "0.75rem" }}>
                  {offering.kind === "product" ? "Product" : "Service"}
                </span>
              </div>
              <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                {isPurchasable ? `${offering.currency} ${offering.price!.toFixed(2)}` : "Contact for pricing"}
              </span>
              {offering.description && (
                <p className="mutedText" style={{ fontSize: "0.8rem", margin: 0 }}>
                  {offering.description.slice(0, 120)}
                </p>
              )}
              {offering.isBookable ? (
                <Link
                  href={`/${username.handle}/services?offeringId=${offering.id}`}
                  className="button buttonSmall"
                  style={offering.id === offeringId ? { borderColor: "var(--accent)" } : undefined}
                >
                  {offering.id === offeringId ? "Viewing times" : "See available times"}
                </Link>
              ) : isPurchasable ? (
                offering.paymentLinkUrl ? (
                  <a href={offering.paymentLinkUrl} target="_blank" rel="noopener noreferrer" className="button buttonSmall">Buy</a>
                ) : nativeCheckoutAvailable ? (
                  currentUser ? (
                    <OfferingBuyButton offeringId={offering.id} price={offering.price!} currency={offering.currency!} />
                  ) : (
                    <Link href="/login" className="button buttonSmall">Log in to buy</Link>
                  )
                ) : (
                  <p className="mutedText" style={{ fontSize: "0.75rem", margin: 0 }}>Not available for checkout yet.</p>
                )
              ) : null}
              {isOwner && (
                <span className="mutedText" style={{ fontSize: "0.75rem" }}>
                  {offering.status === "active" ? "Visible to buyers" : offering.status === "draft" ? "Draft — hidden" : "Archived — hidden"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {selectedOffering && (
        <div>
          <p className="sectionHeading">Available times — {selectedOffering.name}</p>
          {!currentUser ? (
            <p className="mutedText">
              <Link href="/login">Log in</Link> to request an appointment.
            </p>
          ) : slots.length === 0 ? (
            <p className="mutedText">No open slots in the next {SLOT_WINDOW_DAYS} days.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {slots.map((slot) => (
                <RequestSlotButton
                  key={slot.startsAt.toISOString()}
                  offeringId={selectedOffering.id}
                  startsAt={slot.startsAt.toISOString()}
                  label={slot.startsAt.toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  formAction={requestAppointment}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
