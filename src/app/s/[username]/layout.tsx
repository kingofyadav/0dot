import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { SettingsSearchTrigger } from "./SettingsSearchTrigger";

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
