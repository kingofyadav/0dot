import Link from "next/link";

// Shared header for the business management area. One title block + one
// section nav for /b/[slug]/manage and its /contact, /crm, /billing
// subpages, replacing four near-identical inline `<h1> + link row` headers
// that each overflowed a phone viewport. Server component — the active
// section is passed in per route rather than read from the pathname.
export type ManageSection = "overview" | "catalog" | "messages" | "crm" | "billing";

export function BusinessManageNav({
  slug,
  businessName,
  title,
  current,
  contactCount = 0,
}: {
  slug: string;
  businessName: string;
  /** Defaults to "Manage {businessName}". */
  title?: string;
  current: ManageSection;
  /** New (unread) contact messages — shown as a badge on the Messages tab. */
  contactCount?: number;
}) {
  const base = `/b/${slug}`;
  const tabs: { key: ManageSection; label: string; href: string; badge?: number }[] = [
    { key: "overview", label: "Overview", href: `${base}/manage` },
    { key: "catalog", label: "Catalog", href: `${base}/catalog` },
    { key: "messages", label: "Messages", href: `${base}/manage/contact`, badge: contactCount },
    { key: "crm", label: "CRM", href: `${base}/manage/crm` },
    { key: "billing", label: "Billing", href: `${base}/manage/billing` },
  ];

  return (
    <header className="manageHeader">
      <div className="manageHeaderTop">
        <h1 className="manageHeaderTitle">{title ?? `Manage ${businessName}`}</h1>
        <Link href={base} className="manageHeaderView">
          View business page →
        </Link>
      </div>
      <nav className="manageTabs" aria-label="Business management">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className="manageTab"
            aria-current={tab.key === current ? "page" : undefined}
          >
            {tab.label}
            {tab.badge ? <span className="manageTabBadge">{tab.badge}</span> : null}
          </Link>
        ))}
      </nav>
    </header>
  );
}
