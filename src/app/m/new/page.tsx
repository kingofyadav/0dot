import { requireVerifiedUser } from "@/lib/auth-guards";
import { getPostableBusinesses } from "@/lib/businesses";
import { MarketplaceListingForm } from "@/components/MarketplaceListingForm";

export default async function NewMarketplaceListingPage() {
  const user = await requireVerifiedUser();
  const businesses = await getPostableBusinesses(user.id);

  return (
    <div className="profileCard">
      <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>List a theme, template, or app</h1>
      <p className="mutedText" style={{ marginBottom: "1.25rem" }}>
        New listings start as pending review (spec §4.5) — they won&apos;t be purchasable or visible in the
        Marketplace until a moderator approves them.
      </p>
      <MarketplaceListingForm businesses={businesses} />
    </div>
  );
}
