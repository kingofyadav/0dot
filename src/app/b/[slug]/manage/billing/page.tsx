import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isBusinessStaff } from "@/lib/businesses";
import { getActiveBusinessSubscription, PLAN_PRICES } from "@/lib/platform-billing";
import { getDnsInstructions } from "@/lib/custom-domains";
import {
  BusinessSubscribeForm,
  BusinessCancelSubscriptionButton,
  BusinessClaimDomainForm,
  BusinessRemoveDomainButton,
  RetryDomainVerificationButton,
} from "./BusinessBillingForms";

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

export default async function BusinessBillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug).toLowerCase();

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const business = await db.business.findUnique({ where: { slug } });
  if (!business) notFound();
  if (!(await isBusinessStaff(business.id, currentUser.id))) redirect(`/b/${business.slug}`);

  const subscription = await getActiveBusinessSubscription(business.id);
  const { checkout } = await searchParams;
  const domains = await db.customDomain.findMany({
    where: { ownerBusinessId: business.id, status: { not: "removed" } },
    orderBy: { createdAt: "desc" },
  });
  // See the profile domains page's identical comment: a `dormant` row is a
  // 90-day string reservation, not an occupied slot.
  const occupiesSlot = domains.some((d) => d.status === "active" || d.status === "suspended_nonpayment");

  return (
    <div className="profileCard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Billing — {business.name}</h1>
        <Link href={`/b/${business.slug}/manage`} className="button buttonSecondary" style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem" }}>
          Back to manage
        </Link>
      </div>

      <p className="sectionHeading">Subscription</p>
      {subscription ? (
        <div className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.5rem" }}>
          <p>
            <strong>{subscription.status === "cancelled" ? "Subscribed (cancelling)" : "Subscribed"}</strong> — billed{" "}
            {subscription.billingInterval}
          </p>
          <p className="mutedText" style={{ fontSize: "0.85rem" }}>
            {subscription.status === "cancelled" ? "Access continues until " : "Renews "}
            {subscription.currentPeriodEnd.toLocaleDateString()}.
          </p>
          {subscription.status !== "cancelled" && <BusinessCancelSubscriptionButton subscriptionId={subscription.id} />}
        </div>
      ) : (
        <div className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.5rem" }}>
          {checkout === "success" ? (
            <p className="mutedText" style={{ fontSize: "0.85rem" }}>
              Payment received — activating your subscription. Refresh in a moment if it doesn&apos;t show above yet.
            </p>
          ) : (
            <p className="mutedText" style={{ fontSize: "0.85rem" }}>
              Unlocks one included custom domain for this business&apos;s page.
            </p>
          )}
          <BusinessSubscribeForm businessId={business.id} prices={PLAN_PRICES.business_subscription} />
        </div>
      )}

      <p className="sectionHeading" style={{ marginTop: "1.5rem" }}>
        Custom domain
      </p>
      {!subscription && (
        <p className="mutedText" style={{ fontSize: "0.85rem" }}>
          Subscribe above to claim a custom domain for this business.
        </p>
      )}
      {domains.map((domain) => {
        const instructions = getDnsInstructions(domain);
        return (
          <div key={domain.id} className="profileLinkItem" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.5rem" }}>
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
                Reserved to this business for 90 days from removal, then released.
              </p>
            )}
            {domain.status === "active" && (
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {domain.routingStatus !== "routing_verified" && (
                  <RetryDomainVerificationButton customDomainId={domain.id} businessId={business.id} />
                )}
                <BusinessRemoveDomainButton customDomainId={domain.id} businessId={business.id} domain={domain.domain} />
              </div>
            )}
          </div>
        );
      })}
      {subscription && !occupiesSlot && <BusinessClaimDomainForm businessId={business.id} />}
    </div>
  );
}
