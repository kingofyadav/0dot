import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { isProfilePremium } from "@/lib/platform-billing";
import { getDnsInstructions } from "@/lib/custom-domains";
import { removeProfileCustomDomainAction, retryProfileDomainVerificationAction } from "@/app/actions/custom-domains";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ClaimDomainForm } from "./ClaimDomainForm";

export const metadata: Metadata = { title: "Custom domain" };

const ROUTING_LABEL: Record<string, string> = {
  pending_dns: "Waiting for DNS",
  routing_verified: "DNS verified",
  routing_failed: "DNS check failed",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  suspended_nonpayment: "Suspended (billing)",
  dormant: "Dormant",
  removed: "Removed",
};

export default async function DomainsBillingPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const profileRow = await db.profile.findUnique({ where: { userId: currentUser.id } });
  if (!profileRow) redirect("/claim-username");

  const isPremium = await isProfilePremium(profileRow.id);
  const domains = await db.customDomain.findMany({
    where: { ownerProfileId: profileRow.id, status: { not: "removed" } },
    orderBy: { createdAt: "desc" },
  });
  // A `dormant` row is a 90-day string reservation for an already-removed
  // domain (spec §5.3) — still shown below so the owner can see it's
  // reserved, but it doesn't occupy the one included slot, so it must not
  // hide the claim form for a replacement domain.
  const occupiesSlot = domains.some((d) => d.status === "active" || d.status === "suspended_nonpayment");

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Custom domain</h2>

      {!isPremium && (
        <p className="mutedText" style={{ marginBottom: "1rem" }}>
          Custom domains are a Premium perk. <a href="../premium">Subscribe to Premium</a> to claim one.
        </p>
      )}

      {domains.length === 0 && <EmptyState message="No custom domain claimed yet." />}

      {domains.map((domain) => {
        const instructions = getDnsInstructions(domain);
        return (
          <div key={domain.id} className="settingsGroup" style={{ padding: "0.9rem 1rem", marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <p>
              <strong>{domain.domain}</strong> — {STATUS_LABEL[domain.status] ?? domain.status}
            </p>
            <p className="mutedText" style={{ fontSize: "0.85rem" }}>
              {ROUTING_LABEL[domain.routingStatus] ?? domain.routingStatus} · SSL: {domain.sslStatus}
            </p>

            {domain.status === "active" && domain.routingStatus !== "routing_verified" && (
              <div className="mutedText" style={{ fontSize: "0.85rem", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.6rem 0.75rem" }}>
                <p style={{ marginBottom: "0.3rem" }}>
                  Add a <strong>{instructions.recordType}</strong> record:
                </p>
                <p>
                  Host: <code>{instructions.host}</code> → Value: <code>{instructions.value}</code>
                </p>
                <p style={{ marginTop: "0.3rem" }}>{instructions.note}</p>
              </div>
            )}
            {domain.status === "dormant" && (
              <p className="mutedText" style={{ fontSize: "0.85rem" }}>
                Reserved to you for 90 days from removal, then released.
              </p>
            )}

            {domain.status === "active" && (
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {domain.routingStatus !== "routing_verified" && (
                  <form action={retryProfileDomainVerificationAction}>
                    <input type="hidden" name="customDomainId" value={domain.id} />
                    <button type="submit" className="button buttonSecondary buttonSmall">
                      Check DNS now
                    </button>
                  </form>
                )}
                <form action={removeProfileCustomDomainAction}>
                  <input type="hidden" name="customDomainId" value={domain.id} />
                  <ConfirmButton
                    className="button buttonDanger buttonSmall"
                    title="Remove this domain?"
                    description={`${domain.domain} stops serving your profile. The domain string stays reserved to you for 90 days in case you want it back before it's released.`}
                    confirmLabel="Remove"
                  >
                    Remove
                  </ConfirmButton>
                </form>
              </div>
            )}
          </div>
        );
      })}

      {isPremium && !occupiesSlot && <ClaimDomainForm />}
    </div>
  );
}
