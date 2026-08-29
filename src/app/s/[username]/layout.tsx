import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { SettingsSearchTrigger } from "./SettingsSearchTrigger";

// Closest-parent template wins over the root layout's "0dot · %s" (Next.js
// only composes one level), so every settings page's own `title` — see
// each page.tsx — resolves to "0dot · Settings · <page>" instead of just
// "0dot · <page>", matching the "Settings" heading rendered below.
export const metadata: Metadata = {
  title: { template: "0dot · Settings · %s", default: "0dot · Settings" },
};

// Owner-only settings shell, shared by every /s/[username]/* route. Owns
// the auth/own-handle checks and the persistent header that used to be
// duplicated at the top of one 918-line page — every section is now its own
// route under here, so this is the one place that logic needs to live.
// Section-to-section navigation itself lives one level up, in the main
// left nav's Settings accordion (NavLinks.tsx) — no second, page-local
// sidebar competing with this content for width.
export default async function SettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ username: string }>;
}) {
  const { username: rawParam } = await params;
  const handle = decodeURIComponent(rawParam).toLowerCase();

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!currentUser.profile) redirect("/claim-username");

  // Settings is always about *yourself* — there's no legitimate reason to
  // view someone else's, so a mismatched handle in the URL (stale
  // bookmark, typo, someone else's link) sends you to your own settings
  // rather than 404ing or leaking whether that handle exists.
  if (currentUser.username?.handle !== handle) {
    redirect(`/s/${currentUser.username!.handle}`);
  }

  return (
    <div className="settingsShell">
      <div className="settingsHeaderRow">
        <h1>Settings</h1>
        <div className="settingsHeaderActions">
          <SettingsSearchTrigger />
          <Link href={`/${handle}`} className="button buttonSecondary buttonSmall">
            View public profile
          </Link>
        </div>
      </div>
      <div className="settingsContent">{children}</div>
    </div>
  );
}
