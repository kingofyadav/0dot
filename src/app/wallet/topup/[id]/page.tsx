import { notFound } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { buildUpiDeepLink } from "@/lib/upi";
import { SubmitUtrForm } from "@/components/SubmitUtrForm";

const STATUS_LABELS: Record<string, string> = {
  pending_payment: "Awaiting payment",
  submitted: "Under review — an admin will approve this shortly",
  approved: "Approved — coins credited",
  rejected: "Rejected",
};

export default async function TopUpRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireVerifiedUser();
  const { id } = await params;

  const topUpRequest = await db.coinTopUpRequest.findUnique({ where: { id } });
  if (!topUpRequest || topUpRequest.userId !== user.id) notFound();

  const deepLink = buildUpiDeepLink({
    amountInr: topUpRequest.amountInr,
    referenceCode: topUpRequest.referenceCode,
  });

  return (
    <div className="profileCard">
      <h1 className="settingsSectionHeading">
        Top up {topUpRequest.coinAmount} coins (${topUpRequest.coinAmount})
      </h1>
      <p className="mutedText" style={{ marginBottom: "1rem" }}>
        Reference: {topUpRequest.referenceCode} · {STATUS_LABELS[topUpRequest.status] ?? topUpRequest.status}
      </p>

      {topUpRequest.status === "pending_payment" && (
        <div className="settingsGroup" style={{ padding: "1rem", alignItems: "flex-start" }}>
          <p style={{ marginBottom: "0.75rem" }}>
            Scan this QR with any UPI app to pay ₹{topUpRequest.amountInr} (≈ {topUpRequest.coinAmount} coins), then
            submit the UTR below.
          </p>
          <img
            src={`/wallet/topup/${topUpRequest.id}/qr`}
            alt="UPI payment QR code"
            width={220}
            height={220}
            style={{ background: "#fff", padding: "0.5rem", borderRadius: "8px" }}
          />
          <p style={{ margin: "0.75rem 0" }}>
            <a href={deepLink} className="button buttonSecondary">
              Open in a UPI app
            </a>
          </p>
          <SubmitUtrForm requestId={topUpRequest.id} />
        </div>
      )}

      {topUpRequest.status === "submitted" && (
        <div className="settingsGroup" style={{ padding: "1rem" }}>
          <p>
            UTR <strong>{topUpRequest.utr}</strong> submitted — waiting on admin review.
          </p>
        </div>
      )}

      {topUpRequest.status === "approved" && (
        <div className="settingsGroup" style={{ padding: "1rem" }}>
          <p>{topUpRequest.coinAmount} coins were credited to your wallet.</p>
        </div>
      )}

      {topUpRequest.status === "rejected" && (
        <div className="settingsGroup" style={{ padding: "1rem" }}>
          <p className="errorText">
            Rejected{topUpRequest.reviewNote ? `: ${topUpRequest.reviewNote}` : "."} No coins were credited.
          </p>
        </div>
      )}
    </div>
  );
}
