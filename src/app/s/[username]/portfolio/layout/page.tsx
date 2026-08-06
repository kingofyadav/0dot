import { redirect } from "next/navigation";
import { ChevronUp, ChevronDown, LayoutList } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { movePortfolioSection } from "@/app/actions/portfolio-layout";
import { parsePortfolioLayout, PORTFOLIO_SECTION_LABELS } from "@/lib/portfolio-layout";
import { SettingsRow } from "@/components/SettingsRow";
import { PortfolioSectionVisibilityToggle } from "../PortfolioSectionVisibilityToggle";

export default async function PortfolioLayoutSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const profileRow = await db.profile.findUnique({ where: { userId: currentUser.id } });
  if (!profileRow) redirect("/claim-username");

  const portfolioLayout = parsePortfolioLayout(profileRow.portfolioLayoutJson);

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Portfolio layout</h2>
      <p className="mutedText" style={{ fontSize: "0.85rem" }}>
        Reorder or hide the Projects, Skills, Resume, Repositories, and Credentials sections on your
        public profile. A hidden section&rsquo;s entries still exist, they just don&rsquo;t render.
      </p>
      <div className="settingsGroup" style={{ marginTop: "1rem" }}>
        {portfolioLayout.map((entry, index) => (
          <SettingsRow
            key={entry.key}
            icon={LayoutList}
            label={<span style={{ opacity: entry.visible ? 1 : 0.5 }}>{PORTFOLIO_SECTION_LABELS[entry.key]}</span>}
            trailing={
              <>
                <form action={movePortfolioSection}>
                  <input type="hidden" name="key" value={entry.key} />
                  <input type="hidden" name="direction" value="up" />
                  <button type="submit" className="button buttonSecondary iconButton" disabled={index === 0} aria-label="Move up"><ChevronUp size={16} aria-hidden="true" /></button>
                </form>
                <form action={movePortfolioSection}>
                  <input type="hidden" name="key" value={entry.key} />
                  <input type="hidden" name="direction" value="down" />
                  <button type="submit" className="button buttonSecondary iconButton" disabled={index === portfolioLayout.length - 1} aria-label="Move down"><ChevronDown size={16} aria-hidden="true" /></button>
                </form>
                <PortfolioSectionVisibilityToggle
                  sectionKey={entry.key}
                  visible={entry.visible}
                  label={PORTFOLIO_SECTION_LABELS[entry.key]}
                />
              </>
            }
          />
        ))}
      </div>
    </div>
  );
}
