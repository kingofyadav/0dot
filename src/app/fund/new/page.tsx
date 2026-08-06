import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { NewCampaignForm } from "./NewCampaignForm";

export default async function NewCampaignPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const payoutAccount = await db.creatorPayoutAccount.findUnique({ where: { userId: currentUser.id } });

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>Start a fundraiser</h1>
      {(!payoutAccount || payoutAccount.status !== "active") && currentUser.username && (
        <p className="mutedText" style={{ marginBottom: "1rem" }}>
          You&rsquo;ll need payouts enabled to receive donations. {" "}
          <Link href={`/s/${currentUser.username.handle}/monetization/payouts`}>Set up payouts</Link> first.
        </p>
      )}
      <NewCampaignForm />
    </div>
  );
}
