import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Link2, Percent, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toggleProgramStatus } from "@/app/actions/affiliates";
import { SettingsRow } from "@/components/SettingsRow";
import { EmptyState } from "@/components/EmptyState";
import { AffiliateProgramForm } from "../../AffiliateProgramForm";

export const metadata: Metadata = { title: "Affiliate programs" };

export default async function AffiliateSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // spec §7.1: programs the caller created on their own offerings, plus the
  // links the caller holds as an affiliate for *other* creators' programs —
  // both sides of the same feature on one settings page, same precedent
  // Memberships already sets with tiers/subscriptions.
  const [myAffiliatePrograms, myAffiliateLinks, ownedOfferingsForAffiliate] = await Promise.all([
    db.affiliateProgram.findMany({ where: { creatorId: currentUser.id }, orderBy: { createdAt: "desc" } }),
    db.affiliateLink.findMany({
      where: { affiliateId: currentUser.id },
      orderBy: { createdAt: "desc" },
      include: { program: { include: { creator: { include: { username: true } } } }, _count: { select: { clicks: true, conversions: true } } },
    }),
    Promise.all([
      db.membershipTier.findMany({ where: { creatorId: currentUser.id }, select: { id: true, name: true } }),
      db.digitalProduct.findMany({ where: { creatorId: currentUser.id }, select: { id: true, title: true } }),
      db.course.findMany({ where: { creatorId: currentUser.id }, select: { id: true, title: true } }),
    ]),
  ]);
  const [affiliateTierOptions, affiliateProductOptions, affiliateCourseOptions] = ownedOfferingsForAffiliate;

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Affiliate programs</h2>
      {myAffiliatePrograms.length === 0 ? (
        <EmptyState message="No affiliate programs yet." />
      ) : (
        <div className="settingsGroup">
          {myAffiliatePrograms.map((program) => (
            <SettingsRow
              key={program.id}
              icon={Percent}
              label={program.offeringType.replace("_", " ")}
              description={`${program.commissionPercent}% · ${program.status}`}
              trailing={
                <form action={toggleProgramStatus}>
                  <input type="hidden" name="programId" value={program.id} />
                  <button type="submit" className="button buttonSecondary buttonSmall">
                    {program.status === "active" ? "Pause" : "Resume"}
                  </button>
                </form>
              }
            />
          ))}
        </div>
      )}
      <details className="settingsGroup" style={{ marginBottom: "var(--space-6)" }}>
        <summary className="settingsRow settingsAddTrigger">
          <span className="settingsRowIcon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <span className="settingsRowText">
            <span className="settingsRowLabel">Create an affiliate program</span>
          </span>
        </summary>
        <div className="settingsAddPanelBody">
          <AffiliateProgramForm
            ownTiers={affiliateTierOptions.map((t) => ({ id: t.id, label: t.name }))}
            ownProducts={affiliateProductOptions.map((p) => ({ id: p.id, label: p.title }))}
            ownCourses={affiliateCourseOptions.map((c) => ({ id: c.id, label: c.title }))}
          />
        </div>
      </details>

      {myAffiliateLinks.length > 0 && (
        <>
          <p className="settingsGroupLabel">My affiliate links</p>
          <div className="settingsGroup">
            {myAffiliateLinks.map((link) => (
              <SettingsRow
                key={link.id}
                icon={Link2}
                label={link.program.creator.username ? `@${link.program.creator.username.handle}` : "Unknown creator"}
                description={`${link._count.clicks} click${link._count.clicks === 1 ? "" : "s"}, ${link._count.conversions} sale${link._count.conversions === 1 ? "" : "s"} · /aff/${link.code}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
