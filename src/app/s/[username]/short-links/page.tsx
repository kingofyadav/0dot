import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Link2 } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteShortLink } from "@/app/actions/short-links";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EmptyState } from "@/components/EmptyState";
import { SettingsRow } from "@/components/SettingsRow";
import { ShortLinkForm } from "./ShortLinkForm";

export const metadata: Metadata = { title: "Short links" };

export default async function ShortLinksSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const shortLinks = await db.shortLink.findMany({
    where: { ownerId: currentUser.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="settingsSection">
      <h2 className="settingsSectionHeading">Short links</h2>
      <p className="mutedText" style={{ fontSize: "0.9rem" }}>
        Shorten any URL, not just links displayed on your profile.
      </p>

      <div style={{ marginTop: "1rem" }}>
        <ShortLinkForm />
      </div>

      {shortLinks.length === 0 ? (
        <EmptyState message="No short links yet." />
      ) : (
        <div className="settingsGroup" style={{ marginTop: "1.5rem" }}>
          {shortLinks.map((link) => (
            <SettingsRow
              key={link.id}
              icon={Link2}
              label={
                <a href={`/l/${link.shortCode}`} target="_blank" rel="noopener noreferrer">
                  /l/{link.shortCode}
                </a>
              }
              description={link.destinationUrl}
              trailing={
                <>
                  <span>{link.clickCount} clicks</span>
                  <form action={deleteShortLink}>
                    <input type="hidden" name="shortLinkId" value={link.id} />
                    <ConfirmButton
                      className="button buttonSecondary iconButton"
                      aria-label="Delete short link"
                      title="Delete this short link?"
                      description="Anyone who has this link will get redirected to the 0dot homepage instead."
                      confirmLabel="Delete"
                    >
                      ×
                    </ConfirmButton>
                  </form>
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
