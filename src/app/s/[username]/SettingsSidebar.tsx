"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };
type NavGroup = { label: string; items: NavItem[] };

function groups(handle: string): NavGroup[] {
  const base = `/s/${handle}`;
  return [
    {
      label: "Profile",
      items: [
        { href: base, label: "Edit profile" },
        { href: `${base}/links`, label: "Links" },
      ],
    },
    {
      label: "Portfolio",
      items: [
        { href: `${base}/portfolio/projects`, label: "Projects" },
        { href: `${base}/portfolio/skills`, label: "Skills" },
        { href: `${base}/portfolio/resume`, label: "Resume" },
        { href: `${base}/portfolio/repositories`, label: "Repositories" },
        { href: `${base}/portfolio/credentials`, label: "Credentials" },
        { href: `${base}/portfolio/layout`, label: "Layout" },
      ],
    },
    {
      label: "Monetization",
      items: [
        { href: `${base}/monetization/payouts`, label: "Payouts" },
        { href: `${base}/monetization/memberships`, label: "Memberships" },
        { href: `${base}/monetization/products`, label: "Digital products" },
        { href: `${base}/monetization/affiliate`, label: "Affiliate" },
      ],
    },
    {
      label: "Content",
      items: [
        { href: `${base}/content/articles`, label: "Articles" },
        { href: `${base}/content/wiki`, label: "Wiki & Docs" },
        { href: `${base}/content/books`, label: "Books" },
        { href: `${base}/content/files`, label: "Files" },
        { href: `${base}/content/courses`, label: "Courses" },
        { href: `${base}/content/podcast`, label: "Podcast" },
        { href: `${base}/content/newsletter`, label: "Newsletter" },
        { href: `${base}/content/livestreams`, label: "Livestreams" },
      ],
    },
  ];
}

// GitHub/Stripe/Linear-style persistent grouped sub-nav for the settings
// area — replaces the flat 918-line single-scroll page's implicit
// "section order" with real navigation. Client component only for
// usePathname's active-link highlighting; every actual section is still a
// plain Server Component page.
export function SettingsSidebar({ handle }: { handle: string }) {
  const pathname = usePathname();
  const indexHref = `/s/${handle}`;

  return (
    <nav className="settingsSidebar" aria-label="Settings">
      {groups(handle).map((group) => (
        <div key={group.label} className="settingsNavGroup">
          <span className="settingsNavGroupLabel">{group.label}</span>
          {group.items.map((item) => {
            // Exact match for the index route (otherwise it'd also light
            // up as a prefix of every other /s/{handle}/* route); prefix
            // match for everything else.
            const isActive = item.href === indexHref ? pathname === indexHref : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`settingsNavLink${isActive ? " settingsNavLinkActive" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
