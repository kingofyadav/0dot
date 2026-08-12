export type SettingsNavItem = { href: string; label: string };
export type SettingsNavGroup = { label: string; items: SettingsNavItem[] };

// Single source of truth for the settings section list — shared by
// NavLinks' Settings accordion (the master left nav's persistent settings
// nav) and AccountMenu (the header dropdown's Settings submenu) so the two
// never drift out of sync.
export function settingsNavGroups(handle: string): SettingsNavGroup[] {
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
      label: "Security",
      items: [
        { href: `${base}/security`, label: "Change password" },
        { href: `${base}/two-factor`, label: "Two-factor authentication" },
        { href: `${base}/security/sessions`, label: "Active sessions" },
        { href: `${base}/security/contact`, label: "Email & phone" },
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
        { href: `${base}/monetization/services`, label: "Freelance services" },
        { href: `${base}/monetization/affiliate`, label: "Affiliate" },
      ],
    },
    {
      label: "Billing",
      items: [
        { href: `${base}/billing/premium`, label: "Premium" },
        { href: `${base}/billing/domains`, label: "Custom domain" },
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
        { href: `${base}/content/learning-paths`, label: "Learning paths" },
        { href: `${base}/content/podcast`, label: "Podcast" },
        { href: `${base}/content/newsletter`, label: "Newsletter" },
        { href: `${base}/content/livestreams`, label: "Livestreams" },
      ],
    },
    {
      label: "Tools",
      items: [
        { href: `${base}/card`, label: "Business card" },
        { href: `${base}/short-links`, label: "Short links" },
        { href: `${base}/calendar`, label: "Calendar" },
        { href: `${base}/forms`, label: "Forms & surveys" },
        { href: `${base}/cross-post`, label: "Auto-post" },
      ],
    },
    {
      label: "Developer",
      items: [
        { href: `${base}/developer`, label: "Apps" },
        { href: `${base}/authorized-apps`, label: "Authorized apps" },
      ],
    },
    {
      label: "Notifications",
      items: [{ href: `${base}/notifications`, label: "Push & delivery" }],
    },
    {
      label: "Privacy",
      items: [
        { href: `${base}/privacy`, label: "Privacy" },
        { href: `${base}/blocked`, label: "Blocked users" },
      ],
    },
    {
      label: "Account",
      items: [
        { href: `${base}/account`, label: "Account management" },
        { href: `${base}/preferences`, label: "Language & accessibility" },
      ],
    },
  ];
}
