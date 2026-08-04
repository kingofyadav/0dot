import Link from "next/link";
import {
  BROWSE_CATEGORY_LABELS,
  fetchAllMarketplaceCategories,
  fetchMarketplaceCategory,
  type MarketplaceBrowseCategory,
} from "@/lib/marketplace-browse";

type TabKey = "all" | MarketplaceBrowseCategory;
const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "theme", label: BROWSE_CATEGORY_LABELS.theme },
  { key: "template", label: BROWSE_CATEGORY_LABELS.template },
  { key: "app", label: BROWSE_CATEGORY_LABELS.app },
  { key: "course", label: BROWSE_CATEGORY_LABELS.course },
  { key: "digital_product", label: BROWSE_CATEGORY_LABELS.digital_product },
  { key: "freelance_service", label: BROWSE_CATEGORY_LABELS.freelance_service },
];

// spec §6.1/§9 step 7: the cross-entity browse experience, a query-time
// union over Course/DigitalProduct/Offering(freelance)/MarketplaceListing —
// each tab queries its own source table with its own ranking (§6.2), same
// tabbed shape /search already established for its multi-entity tabs
// rather than one blended list with one global formula.
export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: TabKey = (TABS.map((t) => t.key) as string[]).includes(rawTab ?? "") ? (rawTab as TabKey) : "all";

  const items = tab === "all" ? await fetchAllMarketplaceCategories("") : await fetchMarketplaceCategory(tab, "");

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Marketplace</h1>
          <p className="mutedText" style={{ fontSize: "0.85rem", margin: "0.15rem 0 0" }}>
            Themes, templates, apps, courses, digital products, and freelance services in one place.
          </p>
        </div>
        <Link href="/m/new" className="button" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          List a theme, template, or app
        </Link>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/m" : `/m?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`button buttonSmall ${tab === t.key ? "" : "buttonSecondary"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="mutedText">Nothing here yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {items.map((item) => (
            <Link
              key={`${item.category}-${item.id}`}
              href={item.href}
              className="profileLinkItem"
              style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.4rem" }}
            >
              <span style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 600 }}>{item.title}</span>
                <span className="mutedText" style={{ fontSize: "0.8rem" }}>
                  {item.categoryLabel} · {item.subtitle}
                </span>
              </span>
              <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                {item.priceLabel}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
