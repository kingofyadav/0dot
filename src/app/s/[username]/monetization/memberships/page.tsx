import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { archiveTier, cancelSubscription } from "@/app/actions/memberships";
import { TierForm } from "../../TierForm";

export default async function MembershipsSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // spec §4: the creator's own tiers (every status — archived tiers still
  // need to show up here so they can be reactivated, unlike the public
  // profile which only ever offers active ones) and this user's own
  // subscriptions to *other* creators' tiers (the fan side of the same
  // feature, surfaced on the same settings page rather than a second
  // route).
  const [myTiers, mySubscriptions] = await Promise.all([
    db.membershipTier.findMany({ where: { creatorId: currentUser.id }, orderBy: { level: "asc" } }),
    db.membershipSubscription.findMany({
      where: { fanId: currentUser.id },
      orderBy: { createdAt: "desc" },
      include: { tier: { include: { creator: { include: { username: true, profile: true } } } } },
    }),
  ]);

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Memberships</h2>
      {myTiers.length === 0 && <p className="mutedText">No membership tiers yet.</p>}
      {myTiers.map((tier) => (
        <div key={tier.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem", marginBottom: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              <strong>{tier.name}</strong>{" "}
              <span className="mutedText">
                Level {tier.level} · {tier.price.toFixed(2)} {tier.currency.toUpperCase()}/{tier.billingInterval === "yearly" ? "yr" : "mo"} · {tier.status}
              </span>
            </span>
            {tier.status === "active" && (
              <form action={archiveTier}>
                <input type="hidden" name="tierId" value={tier.id} />
                <button type="submit" className="button buttonSecondary buttonSmall">Archive</button>
              </form>
            )}
          </div>
          <details className="profileEditToggle">
            <summary className="mutedText" style={{ fontSize: "0.85rem" }}>Edit</summary>
            <div style={{ marginTop: "0.5rem" }}>
              <TierForm tier={tier} />
            </div>
          </details>
        </div>
      ))}
      <details className="profileEditToggle" style={{ marginTop: "0.5rem" }}>
        <summary>Add a tier</summary>
        <div style={{ marginTop: "0.5rem" }}>
          <TierForm />
        </div>
      </details>

      {mySubscriptions.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <p className="mutedText" style={{ fontSize: "0.85rem", fontWeight: 600 }}>My subscriptions</p>
          {mySubscriptions.map((sub) => (
            <div key={sub.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.35rem 0" }}>
              <span className="mutedText" style={{ fontSize: "0.85rem" }}>
                {sub.tier.creator.username ? (
                  <Link href={`/${sub.tier.creator.username.handle}`}>{sub.tier.creator.profile?.displayName ?? sub.tier.creator.username.handle}</Link>
                ) : (
                  "Unknown creator"
                )}
                {" — "}
                {sub.tier.name} ({sub.status}
                {sub.status === "cancelled" && sub.currentPeriodEnd > new Date() ? `, access until ${sub.currentPeriodEnd.toLocaleDateString()}` : ""})
              </span>
              {sub.status === "active" && (
                <form action={cancelSubscription}>
                  <input type="hidden" name="subscriptionId" value={sub.id} />
                  <button type="submit" className="button buttonSecondary buttonSmall">Cancel</button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
