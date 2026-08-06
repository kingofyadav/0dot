import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBusinessMember, canManageCatalog } from "@/lib/businesses";
import { archiveOffering, updateOfferingPurchaseStatus } from "@/app/actions/offerings";
import { OfferingForm } from "@/components/OfferingForm";

const KIND_VALUES = new Set(["product", "service"]);
const STATUS_LABEL: Record<string, string> = { draft: "Draft", active: "Active", archived: "Archived" };
const PURCHASE_STATUS_LABEL: Record<string, string> = { pending: "Pending", fulfilled: "Fulfilled", refunded: "Refunded" };

function firstImage(imagesJson: string | null): string | null {
  if (!imagesJson) return null;
  try {
    const urls: unknown = JSON.parse(imagesJson);
    return Array.isArray(urls) && typeof urls[0] === "string" ? urls[0] : null;
  } catch {
    return null;
  }
}

// spec §7/§8: the same grid backs both the "Products & Services" tab and
// the Store view (../store/page.tsx layers storefront styling/Buy buttons on
// top of this exact data, not a second query) — filterable by kind,
// draft/archived only ever visible to staff.
export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();
  const { kind: rawKind } = await searchParams;
  const kindFilter = rawKind && KIND_VALUES.has(rawKind) ? rawKind : null;

  const business = await db.business.findUnique({ where: { slug } });
  if (!business) notFound();

  const currentUser = await getCurrentUser();
  const membership = currentUser ? await getBusinessMember(business.id, currentUser.id) : null;
  if (business.status === "pending" && !membership) notFound();

  const canManage = currentUser ? await canManageCatalog(business.id, currentUser.id) : false;

  const offerings = await db.offering.findMany({
    where: {
      businessId: business.id,
      ...(kindFilter ? { kind: kindFilter } : {}),
      ...(canManage ? {} : { status: "active" }),
    },
    orderBy: { createdAt: "desc" },
  });

  const orders = canManage
    ? await db.offeringPurchase.findMany({
        where: { offering: { businessId: business.id } },
        orderBy: { createdAt: "desc" },
        include: { offering: { select: { name: true } }, buyer: { include: { username: true, profile: true } } },
      })
    : [];

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{business.name} — Catalog</h1>
        <Link href={`/b/${business.slug}`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to business page
        </Link>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <Link
          href={`/b/${business.slug}/catalog`}
          className="button buttonSecondary buttonSmall"
          style={kindFilter === null ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
        >
          All
        </Link>
        <Link
          href={`/b/${business.slug}/catalog?kind=product`}
          className="button buttonSecondary buttonSmall"
          style={kindFilter === "product" ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
        >
          Products
        </Link>
        <Link
          href={`/b/${business.slug}/catalog?kind=service`}
          className="button buttonSecondary buttonSmall"
          style={kindFilter === "service" ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
        >
          Services
        </Link>
      </div>

      {canManage && (
        <details className="profileEditToggle" style={{ marginBottom: "1.5rem" }}>
          <summary className="sectionHeading" style={{ cursor: "pointer" }}>
            Add offering
          </summary>
          <div style={{ marginTop: "0.6rem" }}>
            <OfferingForm owner={{ type: "business", businessId: business.id }} />
          </div>
        </details>
      )}

      {offerings.length === 0 && <EmptyState message="Nothing here yet." />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem" }}>
        {offerings.map((offering) => {
          const image = firstImage(offering.imagesJson);
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
                {offering.price !== null ? `${offering.currency} ${offering.price.toFixed(2)}` : "Contact for pricing"}
              </span>
              {offering.description && (
                <p className="mutedText" style={{ fontSize: "0.8rem", margin: 0 }}>
                  {offering.description.slice(0, 120)}
                </p>
              )}
              {canManage && (
                <>
                  <span className="mutedText" style={{ fontSize: "0.75rem" }}>
                    {STATUS_LABEL[offering.status] ?? offering.status}
                  </span>
                  <details className="profileEditToggle">
                    <summary className="mutedText" style={{ fontSize: "0.8rem", cursor: "pointer" }}>
                      Edit
                    </summary>
                    <div style={{ marginTop: "0.5rem" }}>
                      <OfferingForm
                        owner={{ type: "business", businessId: business.id }}
                        offering={{
                          id: offering.id,
                          kind: offering.kind,
                          name: offering.name,
                          description: offering.description,
                          price: offering.price,
                          currency: offering.currency,
                          paymentLinkUrl: offering.paymentLinkUrl,
                          status: offering.status,
                          sku: offering.sku,
                          stockStatus: offering.stockStatus,
                          isBookable: offering.isBookable,
                          durationMinutes: offering.durationMinutes,
                        }}
                      />
                    </div>
                  </details>
                  {offering.status !== "archived" && (
                    <form action={archiveOffering}>
                      <input type="hidden" name="offeringId" value={offering.id} />
                      <button type="submit" className="button buttonDanger buttonSmall">
                        Archive
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {canManage && orders.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <p className="sectionHeading">Orders</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {orders.map((order) => {
              const buyerName = order.buyer.profile?.displayName ?? order.buyer.username?.handle ?? "Unknown";
              return (
                <div key={order.id} className="profileLinkItem" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.85rem" }}>
                    {order.offering.name} × {order.quantity} — {buyerName}
                  </span>
                  <form action={updateOfferingPurchaseStatus} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                    <input type="hidden" name="purchaseId" value={order.id} />
                    <select name="status" defaultValue={order.status} className="textInput" style={{ width: "auto", fontSize: "0.8rem" }}>
                      {Object.entries(PURCHASE_STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    <button type="submit" className="button buttonSecondary buttonSmall">Update</button>
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
