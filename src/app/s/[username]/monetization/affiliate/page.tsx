import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { toggleProgramStatus } from "@/app/actions/affiliates";
import { AffiliateProgramForm } from "../../AffiliateProgramForm";

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
      {myAffiliatePrograms.length === 0 && <p className="mutedText">No affiliate programs yet.</p>}
      {myAffiliatePrograms.map((program) => (
        <div key={program.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.3rem 0" }}>
          <span className="mutedText" style={{ fontSize: "0.85rem" }}>
            {program.offeringType.replace("_", " ")} · {program.commissionPercent}% · {program.status}
          </span>
          <form action={toggleProgramStatus}>
            <input type="hidden" name="programId" value={program.id} />
            <button type="submit" className="button buttonSecondary buttonSmall">
              {program.status === "active" ? "Pause" : "Resume"}
            </button>
          </form>
        </div>
      ))}
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Create an affiliate program</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <AffiliateProgramForm
            ownTiers={affiliateTierOptions.map((t) => ({ id: t.id, label: t.name }))}
            ownProducts={affiliateProductOptions.map((p) => ({ id: p.id, label: p.title }))}
            ownCourses={affiliateCourseOptions.map((c) => ({ id: c.id, label: c.title }))}
          />
        </div>
      </details>

      {myAffiliateLinks.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <p className="mutedText" style={{ fontSize: "0.85rem", fontWeight: 600 }}>My affiliate links</p>
          {myAffiliateLinks.map((link) => (
            <div key={link.id} style={{ padding: "0.3rem 0" }}>
              <p className="mutedText" style={{ fontSize: "0.85rem", margin: 0 }}>
                {link.program.creator.username ? `@${link.program.creator.username.handle}` : "Unknown creator"} — {link._count.clicks} click{link._count.clicks === 1 ? "" : "s"}, {link._count.conversions} sale{link._count.conversions === 1 ? "" : "s"}
              </p>
              <p style={{ fontSize: "0.8rem", margin: 0, wordBreak: "break-all" }}>/aff/{link.code}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
