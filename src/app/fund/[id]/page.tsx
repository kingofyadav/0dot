import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { cancelFundraisingCampaign } from "@/app/actions/donations";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DonateForm } from "./DonateForm";
import { EmptyState } from "@/components/EmptyState";

// spec §11: is_anonymous hides the donor's name from *public* display
// only — the organizer still sees who donated (§11.1's acceptance
// criterion), same "anonymous to whom" distinction as Phase 12/13.
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const campaign = await db.fundraisingCampaign.findUnique({
    where: { id },
    include: { organizerUser: { select: { id: true, username: true, profile: true } } },
  });
  if (!campaign) notFound();

  const currentUser = await getCurrentUser();
  const isOrganizer = currentUser?.id === campaign.organizerUserId;

  const donations = await db.donation.findMany({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: "desc" },
    include: { donor: { select: { id: true, profile: true } } },
    take: 50,
  });

  const progressPct = campaign.goalAmount ? Math.min(100, Math.round((campaign.raisedAmount / campaign.goalAmount) * 100)) : null;

  return (
    <div className="profileCard">
      {campaign.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a local/optimizable asset
        <img
          src={campaign.coverImageUrl}
          alt=""
          style={{ width: "100%", maxHeight: "280px", objectFit: "cover", borderRadius: "10px", marginBottom: "0.75rem" }}
        />
      )}
      <h1 style={{ fontSize: "1.2rem", fontWeight: 700 }}>{campaign.title}</h1>
      {campaign.organizerUser?.username && (
        <p className="mutedText">
          by <Link href={`/${campaign.organizerUser.username.handle}`}>{campaign.organizerUser.profile?.displayName}</Link>
        </p>
      )}
      {campaign.description && <p style={{ marginTop: "0.75rem", whiteSpace: "pre-wrap" }}>{campaign.description}</p>}

      <p style={{ marginTop: "0.75rem" }}>
        <strong>{campaign.raisedAmount.toLocaleString()} {campaign.currency.toUpperCase()}</strong> raised
        {campaign.goalAmount && ` of ${campaign.goalAmount.toLocaleString()} ${campaign.currency.toUpperCase()} goal`}
      </p>
      {progressPct !== null && (
        <div style={{ height: "8px", borderRadius: "4px", background: "var(--border)", overflow: "hidden", marginTop: "0.4rem" }}>
          <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--accent, #4285f4)" }} />
        </div>
      )}

      {campaign.status !== "active" ? (
        <p className="mutedText" style={{ marginTop: "1rem" }}>This campaign is {campaign.status}.</p>
      ) : (
        <div style={{ marginTop: "1rem" }}>
          <DonateForm campaignId={campaign.id} />
        </div>
      )}

      {isOrganizer && campaign.status === "active" && (
        <form action={cancelFundraisingCampaign} style={{ marginTop: "0.75rem" }}>
          <input type="hidden" name="campaignId" value={campaign.id} />
          <ConfirmButton
            className="button buttonSecondary buttonSmall"
            title="End this fundraiser?"
            description="No further donations will be accepted."
            confirmLabel="End fundraiser"
          >
            End fundraiser
          </ConfirmButton>
        </form>
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <p className="sectionHeading">Donations</p>
        {donations.length === 0 && <EmptyState message="No donations yet." />}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {donations.map((donation) => {
            // isAnonymous hides identity from every viewer except the
            // organizer themself — the tax-receipt/thank-you exception
            // spec §11 calls out.
            const showDonorName = !donation.isAnonymous || isOrganizer;
            return (
              <div key={donation.id} style={{ fontSize: "0.9rem" }}>
                <strong>
                  {showDonorName ? donation.donor.profile?.displayName ?? "Someone" : "Anonymous"}
                  {donation.isAnonymous && isOrganizer && " (anonymous)"}
                </strong>{" "}
                donated {donation.amount.toLocaleString()} {donation.currency.toUpperCase()}
                {donation.message && <p className="mutedText" style={{ margin: "0.1rem 0 0" }}>&ldquo;{donation.message}&rdquo;</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
