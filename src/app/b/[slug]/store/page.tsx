import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBusinessMember, canManageCatalog } from "@/lib/businesses";
import { getWalletBalance } from "@/lib/wallet/ledger";
import { BusinessContactForm } from "../BusinessContactForm";
import { OfferingBuyButton } from "@/components/OfferingBuyButton";

function firstImage(imagesJson: string | null): string | null {
  if (!imagesJson) return null;
  try {
    const urls: unknown = JSON.parse(imagesJson);
    return Array.isArray(urls) && typeof urls[0] === "string" ? urls[0] : null;
  } catch {
    return null;
  }
}

// build plan step 5 / spec §8.1-8.2: a storefront *view* over the same
// Offering data the Catalog tab reads (no Order/Transaction table, no card
// data anywhere) — each priced offering gets a "Buy" button that opens the
// business's external payment link, or falls back to the single contact
// form at the bottom of the page when no link is set.
export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const business = await db.business.findUnique({ where: { slug } });
  if (!business) notFound();

  const currentUser = await getCurrentUser();
  const membership = currentUser ? await getBusinessMember(business.id, currentUser.id) : null;
  if (business.status === "pending" && !membership) notFound();

  const canManage = currentUser ? await canManageCatalog(business.id, currentUser.id) : false;
  const [payoutAccount, viewerWallet] = await Promise.all([
    db.creatorPayoutAccount.findUnique({ where: { businessId: business.id } }),
    currentUser ? getWalletBalance(currentUser.id) : Promise.resolve(null),
  ]);
  const cardCheckoutAvailable = payoutAccount?.status === "active";
  const viewerCoins = viewerWallet?.total ?? 0;

  const offerings = await db.offering.findMany({
    where: {
      businessId: business.id,
      ...(canManage ? {} : { status: "active" }),
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{business.name} — Store</h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link href={`/b/${business.slug}/catalog`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            Full catalog
          </Link>
          <Link href={`/b/${business.slug}`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
            Back to business page
          </Link>
        </div>
      </div>

      {offerings.length === 0 && <EmptyState message="Nothing here yet." />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem" }}>
        {offerings.map((offering) => {
          const image = firstImage(offering.imagesJson);
          const isPurchasable = offering.price !== null;
          return (
            <div key={offering.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.4rem" }}>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
                <img src={image} alt="" style={{ width: "100%", height: "120px", objectFit: "cover", borderRadius: "8px" }} />
              ) : (
                <div style={{ width: "100%", height: "120px", borderRadius: "8px", background: "color-mix(in srgb, var(--foreground) 6%, transparent)" }} />
              )}
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
              {isPurchasable ? (
                offering.paymentLinkUrl ? (
                  <a href={offering.paymentLinkUrl} target="_blank" rel="noopener noreferrer" className="button buttonSmall">
                    Buy
                  </a>
                ) : currentUser ? (
                  <OfferingBuyButton
                    offeringId={offering.id}
                    price={offering.price!}
                    currency={offering.currency!}
                    cardAvailable={cardCheckoutAvailable}
                    viewerCoins={viewerCoins}
                  />
                ) : (
                  <Link href="/login" className="button buttonSmall">
                    Log in to buy
                  </Link>
                )
              ) : (
                <a href="#contact" className="button buttonSecondary buttonSmall">
                  Contact to order
                </a>
              )}
              {canManage && (
                <span className="mutedText" style={{ fontSize: "0.75rem" }}>
                  {offering.status === "active" ? "Visible to customers" : offering.status === "draft" ? "Draft — hidden from customers" : "Archived — hidden from customers"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div id="contact" style={{ marginTop: "1.5rem" }}>
        <p className="sectionHeading">Contact to buy</p>
        <BusinessContactForm businessId={business.id} isLoggedIn={Boolean(currentUser)} />
      </div>
    </div>
  );
}
