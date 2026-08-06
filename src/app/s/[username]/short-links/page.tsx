import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deleteShortLink } from "@/app/actions/short-links";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EmptyState } from "@/components/EmptyState";
import { ShortLinkForm } from "./ShortLinkForm";

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

      <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {shortLinks.length === 0 && <EmptyState message="No short links yet." />}
        {shortLinks.map((link) => (
          <div key={link.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.6rem 0.8rem" }}>
            <div style={{ overflow: "hidden" }}>
              <a href={`/l/${link.shortCode}`} target="_blank" rel="noopener noreferrer">
                /l/{link.shortCode}
              </a>
              <p className="mutedText" style={{ margin: 0, fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                → {link.destinationUrl}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
              <span className="mutedText" style={{ fontSize: "0.8rem" }}>{link.clickCount} clicks</span>
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
