import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { CardForm } from "../CardForm";

export const metadata: Metadata = { title: "Digital business card" };

export default async function CardSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: currentUser.id } });
  if (!profile) redirect("/claim-username");

  const card = await db.digitalBusinessCard.findUnique({ where: { profileId: profile.id } });
  const includedFields = card ? (JSON.parse(card.includedFields) as string[]) : [];

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Digital business card</h2>
      <p className="mutedText" style={{ fontSize: "0.9rem" }}>
        A shareable, quick-contact-exchange view of your profile — same QR code and URL as your profile page.
      </p>
      {card?.enabled && (
        <p style={{ margin: "0.6rem 0 1rem" }}>
          <Link href={`/${currentUser.username!.handle}/card`} className="button buttonSecondary buttonSmall">
            View public card
          </Link>
        </p>
      )}
      <div style={{ marginTop: card?.enabled ? 0 : "1rem" }}>
        <CardForm enabled={card?.enabled ?? false} includedFields={includedFields} />
      </div>
    </div>
  );
}
